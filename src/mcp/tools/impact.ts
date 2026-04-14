import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../../db/client.ts'
import {
  productNodes,
  pageNodes,
  functionNodes,
  productNodeEdges,
  pageNodeEdges,
  functionEdges,
  pageFeatureEdges,
  scenarios,
  scenarioSteps,
  scenarioConnections,
  permissions,
  nodePermissions,
} from '../../db/schema.ts'
import type { McpContext } from '../context.ts'

export function registerImpactTools(server: McpServer, ctx: McpContext) {
  const { mapId } = ctx

  server.tool(
    'analyze_impact',
    'Report everything a node is currently tied to — incoming/outgoing dependencies, scenario steps referencing it (and anchor status), sub-nodes, permissions, and changeKind-specific risks. CALL THIS BEFORE any destructive or structural change: delete_node, update_node with rename or reparent fields, convert_feature_scope. Show the narrative output to the user so they can confirm or abort before the mutation. Read-only.',
    {
      nodeId: z.string(),
      nodeType: z.enum(['product', 'page', 'feature']),
      changeKind: z
        .enum(['update', 'rename', 'reparent', 'rescope', 'delete'])
        .optional()
        .describe(
          'Optional hint so the risk section can flag concerns specific to the intended change.'
        ),
    },
    async ({ nodeId, nodeType, changeKind }) => {
      const db = await getDb()

      let nodeName: string | null = null
      let nodeIdentifier: string | null = null
      let nodeScope: string | null = null
      let nodePageNodeId: string | null = null

      if (nodeType === 'product') {
        const [n] = await db
          .select()
          .from(productNodes)
          .where(and(eq(productNodes.id, nodeId), eq(productNodes.mapId, mapId)))
        if (!n) return notFound(nodeId)
        nodeName = n.name
      } else if (nodeType === 'page') {
        const [n] = await db
          .select()
          .from(pageNodes)
          .where(and(eq(pageNodes.id, nodeId), eq(pageNodes.mapId, mapId)))
        if (!n) return notFound(nodeId)
        nodeName = n.name
        nodeIdentifier = n.identifier
      } else {
        const [n] = await db
          .select()
          .from(functionNodes)
          .where(and(eq(functionNodes.id, nodeId), eq(functionNodes.mapId, mapId)))
        if (!n) return notFound(nodeId)
        nodeName = n.name
        nodeIdentifier = n.identifier
        nodeScope = n.scope
        nodePageNodeId = n.pageNodeId
      }

      type EdgeRef = { edgeId: string; otherId: string; otherType: string; kind: string }
      type ChildRef = { type: string; id: string; name: string; identifier: string | null }

      const [incomingRows, outgoingRows, stepRows, childrenDesc, permissionsRows] =
        await Promise.all([
          (async (): Promise<EdgeRef[]> => {
            const res: EdgeRef[] = []
            if (nodeType === 'product') {
              const rows = await db
                .select({ id: productNodeEdges.id, otherId: productNodeEdges.sourceProductId })
                .from(productNodeEdges)
                .where(
                  and(
                    eq(productNodeEdges.mapId, mapId),
                    eq(productNodeEdges.targetProductId, nodeId)
                  )
                )
              for (const r of rows)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'product',
                  kind: 'product_edge',
                })
            } else if (nodeType === 'page') {
              const rows = await db
                .select({ id: pageNodeEdges.id, otherId: pageNodeEdges.sourceId })
                .from(pageNodeEdges)
                .where(
                  and(eq(pageNodeEdges.mapId, mapId), eq(pageNodeEdges.targetId, nodeId))
                )
              for (const r of rows)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'page',
                  kind: 'page_edge',
                })
            } else {
              const [fn, pf] = await Promise.all([
                db
                  .select({ id: functionEdges.id, otherId: functionEdges.sourceFunctionId })
                  .from(functionEdges)
                  .where(
                    and(
                      eq(functionEdges.mapId, mapId),
                      eq(functionEdges.targetFunctionId, nodeId)
                    )
                  ),
                db
                  .select({ id: pageFeatureEdges.id, otherId: pageFeatureEdges.sourcePageId })
                  .from(pageFeatureEdges)
                  .where(
                    and(
                      eq(pageFeatureEdges.mapId, mapId),
                      eq(pageFeatureEdges.targetFunctionId, nodeId)
                    )
                  ),
              ])
              for (const r of fn)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'feature',
                  kind: 'function_edge',
                })
              for (const r of pf)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'page',
                  kind: 'page_feature',
                })
            }
            return res
          })(),
          (async (): Promise<EdgeRef[]> => {
            const res: EdgeRef[] = []
            if (nodeType === 'product') {
              const rows = await db
                .select({ id: productNodeEdges.id, otherId: productNodeEdges.targetProductId })
                .from(productNodeEdges)
                .where(
                  and(
                    eq(productNodeEdges.mapId, mapId),
                    eq(productNodeEdges.sourceProductId, nodeId)
                  )
                )
              for (const r of rows)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'product',
                  kind: 'product_edge',
                })
            } else if (nodeType === 'page') {
              const [pg, pf] = await Promise.all([
                db
                  .select({ id: pageNodeEdges.id, otherId: pageNodeEdges.targetId })
                  .from(pageNodeEdges)
                  .where(
                    and(eq(pageNodeEdges.mapId, mapId), eq(pageNodeEdges.sourceId, nodeId))
                  ),
                db
                  .select({
                    id: pageFeatureEdges.id,
                    otherId: pageFeatureEdges.targetFunctionId,
                  })
                  .from(pageFeatureEdges)
                  .where(
                    and(
                      eq(pageFeatureEdges.mapId, mapId),
                      eq(pageFeatureEdges.sourcePageId, nodeId)
                    )
                  ),
              ])
              for (const r of pg)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'page',
                  kind: 'page_edge',
                })
              for (const r of pf)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'feature',
                  kind: 'page_feature',
                })
            } else {
              const rows = await db
                .select({ id: functionEdges.id, otherId: functionEdges.targetFunctionId })
                .from(functionEdges)
                .where(
                  and(
                    eq(functionEdges.mapId, mapId),
                    eq(functionEdges.sourceFunctionId, nodeId)
                  )
                )
              for (const r of rows)
                res.push({
                  edgeId: r.id,
                  otherId: r.otherId,
                  otherType: 'feature',
                  kind: 'function_edge',
                })
            }
            return res
          })(),
          db
            .select({
              stepId: scenarioSteps.id,
              stepOrder: scenarioSteps.order,
              isAnchor: scenarioSteps.isAnchor,
              scenarioId: scenarios.id,
              scenarioName: scenarios.name,
            })
            .from(scenarioSteps)
            .innerJoin(scenarios, eq(scenarioSteps.scenarioId, scenarios.id))
            .where(and(eq(scenarios.mapId, mapId), eq(scenarioSteps.nodeId, nodeId)))
            .orderBy(asc(scenarios.createdAt), asc(scenarioSteps.order)),
          (async (): Promise<ChildRef[]> => {
            if (nodeType === 'product') {
              const pages = await db
                .select({
                  id: pageNodes.id,
                  name: pageNodes.name,
                  identifier: pageNodes.identifier,
                })
                .from(pageNodes)
                .where(and(eq(pageNodes.mapId, mapId), eq(pageNodes.productNodeId, nodeId)))
              return pages.map((p) => ({
                type: 'page',
                id: p.id,
                name: p.name,
                identifier: p.identifier,
              }))
            }
            if (nodeType === 'page') {
              const [nested, features] = await Promise.all([
                db
                  .select({
                    id: pageNodes.id,
                    name: pageNodes.name,
                    identifier: pageNodes.identifier,
                  })
                  .from(pageNodes)
                  .where(
                    and(eq(pageNodes.mapId, mapId), eq(pageNodes.parentPageId, nodeId))
                  ),
                db
                  .select({
                    id: functionNodes.id,
                    name: functionNodes.name,
                    identifier: functionNodes.identifier,
                  })
                  .from(functionNodes)
                  .where(
                    and(eq(functionNodes.mapId, mapId), eq(functionNodes.pageNodeId, nodeId))
                  ),
              ])
              return [
                ...nested.map((p) => ({
                  type: 'page',
                  id: p.id,
                  name: p.name,
                  identifier: p.identifier,
                })),
                ...features.map((f) => ({
                  type: 'feature',
                  id: f.id,
                  name: f.name,
                  identifier: f.identifier,
                })),
              ]
            }
            const subs = await db
              .select({
                id: functionNodes.id,
                name: functionNodes.name,
                identifier: functionNodes.identifier,
              })
              .from(functionNodes)
              .where(
                and(eq(functionNodes.mapId, mapId), eq(functionNodes.parentFunctionId, nodeId))
              )
            return subs.map((f) => ({
              type: 'feature',
              id: f.id,
              name: f.name,
              identifier: f.identifier,
            }))
          })(),
          db
            .select({ id: permissions.id, name: permissions.name })
            .from(nodePermissions)
            .innerJoin(permissions, eq(nodePermissions.permissionId, permissions.id))
            .where(
              and(
                eq(nodePermissions.nodeId, nodeId),
                eq(nodePermissions.nodeType, nodeType === 'feature' ? 'function' : nodeType),
                eq(permissions.mapId, mapId)
              )
            ),
        ])

      const anchorStepIds = stepRows.filter((s) => s.isAnchor).map((s) => s.stepId)
      const anchorConnRows =
        anchorStepIds.length > 0
          ? await db
              .select({
                id: scenarioConnections.id,
                fromStepId: scenarioConnections.fromStepId,
                toScenarioId: scenarioConnections.toScenarioId,
                condition: scenarioConnections.condition,
              })
              .from(scenarioConnections)
              .where(
                and(
                  eq(scenarioConnections.mapId, mapId),
                  inArray(scenarioConnections.fromStepId, anchorStepIds)
                )
              )
          : []

      const referencedIds = new Set<string>()
      for (const e of incomingRows) referencedIds.add(e.otherId)
      for (const e of outgoingRows) referencedIds.add(e.otherId)
      const referencedScenarioIds = new Set<string>()
      for (const c of anchorConnRows) referencedScenarioIds.add(c.toScenarioId)

      const idsList = Array.from(referencedIds)
      const [prodLookup, pageLookup, featureLookup, scenarioLookup] = await Promise.all([
        idsList.length > 0
          ? db
              .select({ id: productNodes.id, name: productNodes.name })
              .from(productNodes)
              .where(and(eq(productNodes.mapId, mapId), inArray(productNodes.id, idsList)))
          : Promise.resolve([] as { id: string; name: string }[]),
        idsList.length > 0
          ? db
              .select({
                id: pageNodes.id,
                name: pageNodes.name,
                identifier: pageNodes.identifier,
              })
              .from(pageNodes)
              .where(and(eq(pageNodes.mapId, mapId), inArray(pageNodes.id, idsList)))
          : Promise.resolve([] as { id: string; name: string; identifier: string | null }[]),
        idsList.length > 0
          ? db
              .select({
                id: functionNodes.id,
                name: functionNodes.name,
                scope: functionNodes.scope,
              })
              .from(functionNodes)
              .where(and(eq(functionNodes.mapId, mapId), inArray(functionNodes.id, idsList)))
          : Promise.resolve([] as { id: string; name: string; scope: string }[]),
        referencedScenarioIds.size > 0
          ? db
              .select({ id: scenarios.id, name: scenarios.name })
              .from(scenarios)
              .where(
                and(
                  eq(scenarios.mapId, mapId),
                  inArray(scenarios.id, Array.from(referencedScenarioIds))
                )
              )
          : Promise.resolve([] as { id: string; name: string }[]),
      ])
      const displayById = new Map<string, string>()
      for (const p of prodLookup) displayById.set(p.id, p.name)
      for (const pg of pageLookup)
        displayById.set(pg.id, pg.identifier ? `${pg.name} (${pg.identifier})` : pg.name)
      for (const fn of featureLookup)
        displayById.set(fn.id, `${fn.name}${fn.scope === 'shared' ? ' [shared]' : ''}`)
      const scenarioNameById = new Map<string, string>()
      for (const s of scenarioLookup) scenarioNameById.set(s.id, s.name)

      const lines: string[] = []
      const headerLabel = `[${nodeType}] "${nodeName ?? nodeId}"`
      const ident = nodeIdentifier ? ` ${nodeIdentifier}` : ''
      lines.push(`Impact analysis for ${headerLabel}${ident} (${nodeId})`)
      if (nodeType === 'feature') {
        lines.push(
          `Current scope: ${nodeScope}${nodeScope === 'page' && nodePageNodeId ? ` (page=${nodePageNodeId})` : ''}`
        )
      }

      if (incomingRows.length > 0) {
        lines.push('', `Incoming dependencies (${incomingRows.length}):`)
        for (const e of incomingRows) {
          const name = displayById.get(e.otherId) ?? e.otherId
          lines.push(
            `  ← [${e.otherType}] ${name} (${e.otherId}) {kind=${e.kind}, edge=${e.edgeId}}`
          )
        }
      }

      if (outgoingRows.length > 0) {
        lines.push('', `Outgoing dependencies (${outgoingRows.length}):`)
        for (const e of outgoingRows) {
          const name = displayById.get(e.otherId) ?? e.otherId
          lines.push(
            `  → [${e.otherType}] ${name} (${e.otherId}) {kind=${e.kind}, edge=${e.edgeId}}`
          )
        }
      }

      if (stepRows.length > 0) {
        const scenarioCount = new Set(stepRows.map((s) => s.scenarioId)).size
        lines.push(
          '',
          `Scenarios referencing this node (${scenarioCount} scenarios, ${stepRows.length} steps):`
        )
        for (const s of stepRows) {
          const anchor = s.isAnchor ? ' (anchor)' : ''
          lines.push(
            `  • "${s.scenarioName}" step ${s.stepOrder}${anchor} {stepId=${s.stepId}}`
          )
        }
      }

      if (anchorConnRows.length > 0) {
        lines.push('', `Anchor connections from this node (${anchorConnRows.length}):`)
        for (const c of anchorConnRows) {
          const toName = scenarioNameById.get(c.toScenarioId) ?? c.toScenarioId
          const cond = c.condition ? ` if "${c.condition}"` : ''
          lines.push(`  ↳ to scenario "${toName}"${cond} {connection=${c.id}}`)
        }
      }

      if (childrenDesc.length > 0) {
        lines.push('', `Child nodes (${childrenDesc.length}):`)
        for (const c of childrenDesc) {
          const cIdent = c.identifier ? ` ${c.identifier}` : ''
          lines.push(`  - [${c.type}] ${c.name}${cIdent} (${c.id})`)
        }
      }

      if (permissionsRows.length > 0) {
        lines.push('', `Permissions: ${permissionsRows.map((p) => p.name).join(', ')}`)
      }

      const risks: string[] = []
      if (changeKind === 'delete') {
        if (incomingRows.length > 0)
          risks.push(
            `${incomingRows.length} incoming dependency edge(s) will cascade-delete with this node`
          )
        if (stepRows.length > 0)
          risks.push(
            `${stepRows.length} scenario step(s) will be cascade-deleted — check if those scenarios remain meaningful`
          )
        if (childrenDesc.length > 0) {
          const deletesChildren = nodeType === 'product' || nodeType === 'page'
          risks.push(
            deletesChildren
              ? `${childrenDesc.length} child node(s) will cascade-delete`
              : `${childrenDesc.length} sub-feature(s) will lose their parent pointer`
          )
        }
      }
      if (changeKind === 'rescope' && nodeType === 'feature') {
        if (nodeScope === 'shared') {
          const incomingPages = incomingRows.filter((r) => r.kind === 'page_feature')
          if (incomingPages.length > 1) {
            risks.push(
              `${incomingPages.length} pages currently consume this shared feature — converting to page scope keeps the edges but makes only one page the "owner"`
            )
          }
        } else if (nodeScope === 'page' && childrenDesc.length > 0) {
          risks.push(
            `${childrenDesc.length} sub-feature(s) will lose their page association when the parent goes shared`
          )
        }
      }
      if (changeKind === 'reparent' && stepRows.length > 0) {
        risks.push(
          `${stepRows.length} scenario step(s) reference this node by ID — reparent preserves the ID so steps stay valid automatically`
        )
      }
      if (changeKind === 'rename' && stepRows.length > 3) {
        risks.push(
          `${stepRows.length} scenario step(s) display this node's name — rename propagates to markdown export and playback UI`
        )
      }

      if (risks.length > 0) {
        lines.push('', '⚠ Risks:')
        for (const r of risks) lines.push(`  • ${r}`)
      }

      if (
        incomingRows.length === 0 &&
        outgoingRows.length === 0 &&
        stepRows.length === 0 &&
        childrenDesc.length === 0 &&
        permissionsRows.length === 0
      ) {
        lines.push(
          '',
          '(No dependencies, scenarios, children, or permissions reference this node. Safe to modify in isolation.)'
        )
      } else {
        lines.push(
          '',
          'Show this summary to the user before the mutation so they can confirm or abort.'
        )
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )
}

function notFound(nodeId: string) {
  return {
    content: [{ type: 'text' as const, text: `Node ${nodeId} not found in this map.` }],
    isError: true,
  }
}
