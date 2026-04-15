'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
} from '@xyflow/react'
import { Layers, Workflow, Cpu, ExternalLink, ChevronRight, X } from 'lucide-react'
import { loadNode, type NodeDetail } from '../../actions/map.ts'

type NodeType = 'product' | 'page' | 'feature'

interface MapData {
  map: { id: string; name: string }
  products: Array<{ id: string; name: string; positionX: number; positionY: number }>
  pages: Array<{
    id: string
    name: string
    identifier: string | null
    positionX: number
    positionY: number
    kind: string
    productNodeId: string | null
  }>
  functions: Array<{
    id: string
    name: string
    identifier: string | null
    positionX: number | null
    positionY: number | null
    scope: string
    kind: string
    pageNodeId: string | null
  }>
  edges: {
    productEdges: Array<{ id: string; sourceProductId: string; targetProductId: string }>
    pageEdges: Array<{ id: string; sourceId: string; targetId: string }>
    functionEdges: Array<{ id: string; sourceFunctionId: string; targetFunctionId: string }>
    pageFeatureEdges: Array<{
      id: string
      sourcePageId: string
      targetFunctionId: string
    }>
  }
}

const NODE_ICON = {
  product: Layers,
  page: Workflow,
  feature: Cpu,
} as const

const NODE_COLOR = {
  product: '#3b82f6',
  page: '#8b5cf6',
  feature: '#10b981',
} as const

export function MapEditor({ mapId: _mapId, initial }: { mapId: string; initial: MapData }) {
  const [selected, setSelected] = useState<{ id: string; type: NodeType } | null>(null)
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const { nodes, edges } = useMemo(() => buildFlowGraph(initial), [initial])

  const onNodeClick = useCallback(async (_e: unknown, n: Node) => {
    const type = (n.data as { nodeType: NodeType }).nodeType
    setSelected({ id: n.id, type })
    setDetail(null)
    setDetailLoading(true)
    const d = await loadNode(n.id, type)
    setDetail(d)
    setDetailLoading(false)
  }, [])

  return (
    <div className="flex h-screen w-screen">
      <div className="relative flex-1">
        <div className="pointer-events-none absolute top-4 left-4 z-10 flex items-center gap-2">
          <span className="rounded-md border border-border bg-card/95 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
            Fluct · {initial.map.name}
          </span>
          <span className="rounded-md border border-border bg-muted/80 px-2 py-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Local · Read-only
          </span>
        </div>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} color="#e4e4e7" />
            <Controls />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {selected && (
        <aside className="flex h-full w-[400px] flex-col border-l border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: NODE_COLOR[selected.type] }}
              />
              <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
                {selected.type}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {detailLoading || !detail ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <NodeDetailView detail={detail} />
            )}
          </div>

          <div className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
            To edit this node, ask your AI agent — Fluct-mcp is MCP-driven. Any
            change via{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">update_node</code>,{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">update_ai_context</code>,
            etc. will refresh here on reload.
          </div>
        </aside>
      )}
    </div>
  )
}

function NodeDetailView({ detail }: { detail: NodeDetail }) {
  const Icon = NODE_ICON[detail.type]
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Icon size={14} className="text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">{detail.name}</h2>
        </div>
        {detail.identifier && (
          <p className="font-mono text-xs text-muted-foreground">{detail.identifier}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {detail.kind && <Tag>{detail.kind}</Tag>}
          {detail.scope && <Tag>{detail.scope}</Tag>}
          {detail.status && <Tag>{detail.status}</Tag>}
        </div>
      </div>

      {detail.description && (
        <Section label="Description">
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{detail.description}</p>
        </Section>
      )}

      {detail.role && (
        <Section label="Role">
          <p className="text-sm text-foreground/90">{detail.role}</p>
        </Section>
      )}

      {detail.policy && (
        <Section label="Policy">
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{detail.policy}</p>
        </Section>
      )}

      {detail.endpoint && (
        <Section label="Endpoint">
          <code className="text-xs text-foreground/90">{detail.endpoint}</code>
        </Section>
      )}

      <AiContextSection detail={detail} />
    </div>
  )
}

function AiContextSection({ detail }: { detail: NodeDetail }) {
  const ac = detail.aiContext ?? {}
  const anything =
    (ac.sourceFiles?.length ?? 0) > 0 ||
    (ac.testFiles?.length ?? 0) > 0 ||
    (ac.stateTouches?.length ?? 0) > 0 ||
    (ac.runtimeContext?.length ?? 0) > 0 ||
    Boolean(
      ac.ioContract &&
        (ac.ioContract.inputs || ac.ioContract.outputs || ac.ioContract.sideEffects?.length)
    )

  return (
    <Section label="AI context">
      <p className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Maintained by your AI agent via MCP. AI reads this together with the description /
        policy / dependencies — not just these fields.
      </p>
      {!anything && (
        <p className="text-xs text-muted-foreground">
          No AI context recorded yet. Run{' '}
          <code className="rounded bg-muted px-1 py-0.5">sync_from_repo</code> or ask your
          agent to call{' '}
          <code className="rounded bg-muted px-1 py-0.5">update_ai_context</code>.
        </p>
      )}
      {ac.sourceFiles && ac.sourceFiles.length > 0 && (
        <FieldList label="Source files" items={ac.sourceFiles} mono />
      )}
      {ac.testFiles && ac.testFiles.length > 0 && (
        <FieldList label="Test files" items={ac.testFiles} mono />
      )}
      {ac.stateTouches && ac.stateTouches.length > 0 && (
        <FieldList label="State touches" items={ac.stateTouches} />
      )}
      {ac.runtimeContext && ac.runtimeContext.length > 0 && (
        <FieldList label="Runtime / deployment" items={ac.runtimeContext} />
      )}
      {detail.type === 'feature' && ac.ioContract && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            I/O contract
          </p>
          <div className="space-y-2">
            {ac.ioContract.inputs && <KeyVal label="Inputs" value={ac.ioContract.inputs} />}
            {ac.ioContract.outputs && <KeyVal label="Outputs" value={ac.ioContract.outputs} />}
            {ac.ioContract.sideEffects && ac.ioContract.sideEffects.length > 0 && (
              <FieldList label="Side effects" items={ac.ioContract.sideEffects} />
            )}
          </div>
        </div>
      )}
    </Section>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </section>
  )
}

function FieldList({ label, items, mono }: { label: string; items: string[]; mono?: boolean }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item}
            className={`text-xs text-foreground/90 ${mono ? 'font-mono' : ''}`}
          >
            <ChevronRight size={10} className="mr-1 inline text-muted-foreground" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function KeyVal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-xs whitespace-pre-wrap text-foreground/90">{value}</p>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}

// ── Build React Flow graph from server data ────────────────────────────────
function buildFlowGraph(data: MapData): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const hGap = 260
  const vGap = 140

  data.products.forEach((p, i) => {
    nodes.push({
      id: p.id,
      position: { x: p.positionX || 0, y: p.positionY || i * vGap },
      data: { label: p.name, nodeType: 'product' as NodeType, icon: '📦' },
      type: 'default',
      style: {
        background: '#eff6ff',
        border: `2px solid ${NODE_COLOR.product}`,
        borderRadius: 12,
        padding: 8,
        minWidth: 160,
        fontSize: 12,
        fontWeight: 600,
      },
    })
  })
  data.pages.forEach((p, i) => {
    nodes.push({
      id: p.id,
      position: {
        x: p.positionX || 300,
        y: p.positionY || i * vGap,
      },
      data: {
        label: `${p.name}${p.identifier ? `\n${p.identifier}` : ''}`,
        nodeType: 'page' as NodeType,
      },
      type: 'default',
      style: {
        background: '#f5f3ff',
        border: `2px solid ${NODE_COLOR.page}`,
        borderRadius: 12,
        padding: 8,
        minWidth: 160,
        fontSize: 12,
      },
    })
  })
  data.functions.forEach((f, i) => {
    nodes.push({
      id: f.id,
      position: {
        x: f.positionX ?? (f.scope === 'shared' ? 600 : 600),
        y: f.positionY ?? i * vGap,
      },
      data: {
        label: `${f.name}${f.identifier ? `\n${f.identifier}` : ''}${f.scope === 'shared' ? '\n[shared]' : ''}`,
        nodeType: 'feature' as NodeType,
      },
      type: 'default',
      style: {
        background: '#ecfdf5',
        border: `2px solid ${NODE_COLOR.feature}`,
        borderRadius: 12,
        padding: 8,
        minWidth: 140,
        fontSize: 12,
      },
    })
  })

  // Hierarchy edges (parent → child, light)
  data.pages.forEach((p) => {
    if (p.productNodeId) {
      edges.push({
        id: `h-${p.productNodeId}-${p.id}`,
        source: p.productNodeId,
        target: p.id,
        style: { stroke: '#e4e4e7', strokeDasharray: '4 3' },
      })
    }
  })
  data.functions.forEach((f) => {
    if (f.pageNodeId) {
      edges.push({
        id: `h-${f.pageNodeId}-${f.id}`,
        source: f.pageNodeId,
        target: f.id,
        style: { stroke: '#e4e4e7', strokeDasharray: '4 3' },
      })
    }
  })

  // Dependency edges
  data.edges.productEdges.forEach((e) => {
    edges.push({
      id: e.id,
      source: e.sourceProductId,
      target: e.targetProductId,
      style: { stroke: NODE_COLOR.product, strokeWidth: 1.5 },
      animated: false,
    })
  })
  data.edges.pageEdges.forEach((e) => {
    edges.push({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      style: { stroke: NODE_COLOR.page, strokeWidth: 1.5 },
    })
  })
  data.edges.functionEdges.forEach((e) => {
    edges.push({
      id: e.id,
      source: e.sourceFunctionId,
      target: e.targetFunctionId,
      style: { stroke: NODE_COLOR.feature, strokeWidth: 1.5 },
    })
  })
  data.edges.pageFeatureEdges.forEach((e) => {
    edges.push({
      id: e.id,
      source: e.sourcePageId,
      target: e.targetFunctionId,
      style: { stroke: '#f59e0b', strokeWidth: 1.5 },
    })
  })

  return { nodes, edges }
}

// hint unused imports to the linter
void ExternalLink
