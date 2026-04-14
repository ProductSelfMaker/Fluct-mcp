import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '../../db/client.ts'
import { scenarios, scenarioSteps, scenarioConnections } from '../../db/schema.ts'
import type { McpContext } from '../context.ts'

// Scenario tool surface — keeps parity with hosted Fluct minus the
// multi-user bits (no MCP lock, no org scoping beyond the single map).

export function registerScenarioTools(server: McpServer, ctx: McpContext) {
  const { mapId } = ctx

  server.tool(
    'get_scenarios',
    'List all scenarios for the current map with step counts.',
    {},
    async () => {
      const db = await getDb()
      const rows = await db
        .select({
          id: scenarios.id,
          name: scenarios.name,
          color: scenarios.color,
          description: scenarios.description,
          stepCount: sql<number>`(SELECT count(*) FROM scenario_steps WHERE scenario_id = ${scenarios.id})::int`,
        })
        .from(scenarios)
        .where(eq(scenarios.mapId, mapId))
        .orderBy(asc(scenarios.createdAt))

      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scenarios in this map.' }] }
      }
      const lines = rows.map(
        (s) =>
          `- ${s.name} (${s.id}) — ${s.stepCount} steps${s.description ? `: ${s.description}` : ''}`
      )
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )

  server.tool(
    'get_scenario_steps',
    'Return ordered steps for a scenario. Includes stepId, trigger, isAnchor — the IDs you need for connections and anchor toggles.',
    { scenarioId: z.string() },
    async ({ scenarioId }) => {
      const db = await getDb()
      const [scenario] = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, scenarioId), eq(scenarios.mapId, mapId)))
      if (!scenario) {
        return {
          content: [{ type: 'text' as const, text: `Scenario ${scenarioId} not found` }],
          isError: true,
        }
      }
      const steps = await db
        .select()
        .from(scenarioSteps)
        .where(eq(scenarioSteps.scenarioId, scenarioId))
        .orderBy(asc(scenarioSteps.order))

      if (steps.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: `Scenario "${scenario.name}" has no steps.` },
          ],
        }
      }
      const lines = steps.map((s, i) => {
        const flags: string[] = []
        if (s.isAnchor) flags.push('anchor')
        if (s.trigger) flags.push(`trigger: ${s.trigger}`)
        const meta = flags.length > 0 ? ` {${flags.join('; ')}}` : ''
        const desc = s.description
          ? `\n    ${s.description.replace(/\n/g, '\n    ')}`
          : ''
        return `${i + 1}. stepId=${s.id} node=[${s.nodeType ?? '?'}] ${s.nodeId ?? '—'}${meta}${desc}`
      })
      return {
        content: [
          {
            type: 'text' as const,
            text: `Scenario: ${scenario.name} (${scenario.id})\n\n${lines.join('\n')}`,
          },
        ],
      }
    }
  )

  server.tool(
    'create_scenario',
    'Create a scenario with ordered steps. Each step references an existing node; trigger + isAnchor are optional per step. Returns the new scenario id plus the created stepIds.',
    {
      name: z.string(),
      description: z.string().optional(),
      color: z.string().optional(),
      steps: z
        .array(
          z.object({
            nodeId: z.string(),
            nodeType: z.enum(['product', 'page', 'feature']),
            description: z.string(),
            trigger: z.string().optional(),
            isAnchor: z.boolean().optional(),
          })
        )
        .optional(),
    },
    async ({ name, description, color, steps }) => {
      const db = await getDb()
      const [scenario] = await db
        .insert(scenarios)
        .values({
          mapId,
          name,
          description: description ?? null,
          color: color ?? '#3b82f6',
        })
        .returning()

      let inserted: { id: string; order: number }[] = []
      if (scenario && steps && steps.length > 0) {
        inserted = await db
          .insert(scenarioSteps)
          .values(
            steps.map((s, i) => ({
              scenarioId: scenario.id,
              nodeId: s.nodeId,
              nodeType: s.nodeType,
              order: i + 1,
              description: s.description ?? null,
              trigger: s.trigger ?? null,
              isAnchor: s.isAnchor ?? false,
            }))
          )
          .returning({ id: scenarioSteps.id, order: scenarioSteps.order })
      }

      const stepLines = inserted
        .sort((a, b) => a.order - b.order)
        .map((s) => `  ${s.order}. stepId=${s.id}`)
        .join('\n')
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Created scenario "${name}" (${scenario!.id}) with ${inserted.length} steps.` +
              (stepLines ? `\n\nStep IDs:\n${stepLines}` : ''),
          },
        ],
      }
    }
  )

  server.tool(
    'update_scenario_step',
    'Update description, trigger, or anchor flag on a step.',
    {
      stepId: z.string(),
      description: z.string().optional(),
      trigger: z.string().optional(),
      isAnchor: z.boolean().optional(),
    },
    async (args) => {
      const db = await getDb()
      const [step] = await db
        .select()
        .from(scenarioSteps)
        .where(eq(scenarioSteps.id, args.stepId))
      if (!step) {
        return {
          content: [{ type: 'text' as const, text: `Step ${args.stepId} not found` }],
          isError: true,
        }
      }
      const [scenario] = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, step.scenarioId), eq(scenarios.mapId, mapId)))
      if (!scenario) {
        return {
          content: [
            { type: 'text' as const, text: 'Step does not belong to the authenticated map.' },
          ],
          isError: true,
        }
      }
      const updates: Record<string, unknown> = {}
      if (args.description !== undefined) updates.description = args.description || null
      if (args.trigger !== undefined) updates.trigger = args.trigger || null
      if (args.isAnchor !== undefined) updates.isAnchor = args.isAnchor
      if (Object.keys(updates).length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No fields provided to update.' }],
          isError: true,
        }
      }
      await db.update(scenarioSteps).set(updates).where(eq(scenarioSteps.id, args.stepId))
      return {
        content: [
          {
            type: 'text' as const,
            text: `Updated step ${args.stepId} (${Object.keys(updates).join(', ')})`,
          },
        ],
      }
    }
  )

  server.tool(
    'remove_scenario_step',
    'Delete a step. Remaining steps are re-ordered to fill the gap.',
    { stepId: z.string() },
    async ({ stepId }) => {
      const db = await getDb()
      const [step] = await db
        .select()
        .from(scenarioSteps)
        .where(eq(scenarioSteps.id, stepId))
      if (!step) {
        return {
          content: [{ type: 'text' as const, text: `Step ${stepId} not found` }],
          isError: true,
        }
      }
      const [scenario] = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, step.scenarioId), eq(scenarios.mapId, mapId)))
      if (!scenario) {
        return {
          content: [
            { type: 'text' as const, text: 'Step does not belong to the authenticated map.' },
          ],
          isError: true,
        }
      }
      await db.delete(scenarioSteps).where(eq(scenarioSteps.id, stepId))
      const remaining = await db
        .select({ id: scenarioSteps.id })
        .from(scenarioSteps)
        .where(eq(scenarioSteps.scenarioId, step.scenarioId))
        .orderBy(asc(scenarioSteps.order))
      if (remaining.length > 0) {
        const cases = remaining.map((r, i) => `WHEN '${r.id}' THEN ${i + 1}`).join(' ')
        await db.execute(
          sql`UPDATE scenario_steps SET "order" = CASE id::text ${sql.raw(cases)} END WHERE id = ANY(${remaining.map((r) => r.id)})`
        )
      }
      return { content: [{ type: 'text' as const, text: `Removed step ${stepId}` }] }
    }
  )

  server.tool(
    'delete_scenario',
    'Delete a scenario and all its steps/connections.',
    { scenarioId: z.string() },
    async ({ scenarioId }) => {
      const db = await getDb()
      const [scenario] = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, scenarioId), eq(scenarios.mapId, mapId)))
      if (!scenario) {
        return {
          content: [{ type: 'text' as const, text: `Scenario ${scenarioId} not found` }],
          isError: true,
        }
      }
      await db.delete(scenarios).where(eq(scenarios.id, scenarioId))
      return {
        content: [{ type: 'text' as const, text: `Deleted scenario "${scenario.name}"` }],
      }
    }
  )

  // ── Anchors + connections ──────────────────────────────────────────────

  server.tool(
    'toggle_step_anchor',
    'Mark or unmark a scenario step as a connection anchor.',
    { stepId: z.string(), isAnchor: z.boolean() },
    async ({ stepId, isAnchor }) => {
      const db = await getDb()
      await db.update(scenarioSteps).set({ isAnchor }).where(eq(scenarioSteps.id, stepId))
      return {
        content: [
          {
            type: 'text' as const,
            text: `Step ${stepId} ${isAnchor ? 'marked as anchor' : 'unmarked as anchor'}`,
          },
        ],
      }
    }
  )

  server.tool(
    'get_anchors',
    'List all anchor steps in the map.',
    {},
    async () => {
      const db = await getDb()
      const rows = await db
        .select({
          stepId: scenarioSteps.id,
          stepOrder: scenarioSteps.order,
          nodeId: scenarioSteps.nodeId,
          scenarioId: scenarios.id,
          scenarioName: scenarios.name,
        })
        .from(scenarioSteps)
        .innerJoin(scenarios, eq(scenarioSteps.scenarioId, scenarios.id))
        .where(and(eq(scenarios.mapId, mapId), eq(scenarioSteps.isAnchor, true)))
        .orderBy(asc(scenarios.createdAt), asc(scenarioSteps.order))
      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No anchor steps in this map.' }] }
      }
      const lines = rows.map(
        (r) => `- [${r.scenarioName}] step #${r.stepOrder} (${r.stepId}) → node ${r.nodeId}`
      )
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )

  server.tool(
    'get_scenario_connections',
    'List scenario connections with human-readable scenario names and step orders.',
    {},
    async () => {
      const db = await getDb()
      const rows = await db
        .select()
        .from(scenarioConnections)
        .where(eq(scenarioConnections.mapId, mapId))
      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scenario connections.' }] }
      }
      const scenarioIds = Array.from(
        new Set(rows.flatMap((r) => [r.fromScenarioId, r.toScenarioId]))
      )
      const stepIds = Array.from(
        new Set(
          rows.flatMap((r) => [r.fromStepId, r.toStepId]).filter(Boolean) as string[]
        )
      )
      const [scenarioRows, stepRows] = await Promise.all([
        scenarioIds.length > 0
          ? db
              .select({ id: scenarios.id, name: scenarios.name })
              .from(scenarios)
              .where(inArray(scenarios.id, scenarioIds))
          : Promise.resolve([] as { id: string; name: string }[]),
        stepIds.length > 0
          ? db
              .select({ id: scenarioSteps.id, order: scenarioSteps.order })
              .from(scenarioSteps)
              .where(inArray(scenarioSteps.id, stepIds))
          : Promise.resolve([] as { id: string; order: number }[]),
      ])
      const scenarioName = new Map(scenarioRows.map((s) => [s.id, s.name]))
      const stepOrder = new Map(stepRows.map((s) => [s.id, s.order]))
      const lines = rows.map((r) => {
        const fromName = scenarioName.get(r.fromScenarioId) ?? r.fromScenarioId
        const toName = scenarioName.get(r.toScenarioId) ?? r.toScenarioId
        const fromOrd = stepOrder.get(r.fromStepId)
        const toOrd = r.toStepId ? stepOrder.get(r.toStepId) : null
        const fromLabel = fromOrd ? `step ${fromOrd}` : `step ${r.fromStepId}`
        const toLabel = r.toStepId
          ? toOrd
            ? `step ${toOrd}`
            : `step ${r.toStepId}`
          : 'start'
        return `- ${r.id}: "${fromName}" @${fromLabel} → "${toName}" @${toLabel}${r.condition ? ` [if "${r.condition}"]` : ''}`
      })
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )

  server.tool(
    'create_scenario_connection',
    'Connect two scenarios at a specific step. Optional condition acts as the branch trigger.',
    {
      fromScenarioId: z.string(),
      fromStepId: z.string(),
      toScenarioId: z.string(),
      toStepId: z.string().optional(),
      condition: z.string().optional(),
    },
    async (args) => {
      const db = await getDb()
      if (args.fromScenarioId === args.toScenarioId) {
        return {
          content: [{ type: 'text' as const, text: 'Cannot connect a scenario to itself.' }],
          isError: true,
        }
      }
      // Cycle detection: BFS from toScenarioId. If we can reach fromScenarioId
      // via existing outgoing connections, adding this edge would cycle.
      const existing = await db
        .select({
          fromScenarioId: scenarioConnections.fromScenarioId,
          toScenarioId: scenarioConnections.toScenarioId,
        })
        .from(scenarioConnections)
        .where(eq(scenarioConnections.mapId, mapId))
      const outgoing = new Map<string, string[]>()
      for (const e of existing) {
        const arr = outgoing.get(e.fromScenarioId) ?? []
        arr.push(e.toScenarioId)
        outgoing.set(e.fromScenarioId, arr)
      }
      const visited = new Set<string>()
      const queue = [args.toScenarioId]
      while (queue.length > 0) {
        const current = queue.shift()!
        if (current === args.fromScenarioId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Creating this connection would introduce a cycle.',
              },
            ],
            isError: true,
          }
        }
        if (visited.has(current)) continue
        visited.add(current)
        const nexts = outgoing.get(current) ?? []
        queue.push(...nexts)
      }
      const [conn] = await db
        .insert(scenarioConnections)
        .values({
          mapId,
          fromScenarioId: args.fromScenarioId,
          fromStepId: args.fromStepId,
          toScenarioId: args.toScenarioId,
          toStepId: args.toStepId ?? null,
          condition: args.condition ?? null,
        })
        .returning()
      return {
        content: [{ type: 'text' as const, text: `Created connection ${conn!.id}` }],
      }
    }
  )

  server.tool(
    'create_scenario_from_anchor',
    'Create a new scenario branching from an existing anchor step. Seeds step 1 from the anchor node and wires a scenario_connection automatically. One-shot branching.',
    {
      anchorStepId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      color: z.string().optional(),
      condition: z.string().optional(),
      additionalSteps: z
        .array(
          z.object({
            nodeId: z.string(),
            nodeType: z.enum(['product', 'page', 'feature']),
            description: z.string(),
            trigger: z.string().optional(),
            isAnchor: z.boolean().optional(),
          })
        )
        .optional(),
    },
    async (args) => {
      const db = await getDb()
      const [anchor] = await db
        .select()
        .from(scenarioSteps)
        .where(eq(scenarioSteps.id, args.anchorStepId))
      if (!anchor) {
        return {
          content: [
            { type: 'text' as const, text: `Anchor step ${args.anchorStepId} not found` },
          ],
          isError: true,
        }
      }
      if (!anchor.isAnchor) {
        return {
          content: [
            { type: 'text' as const, text: 'Step is not marked as anchor.' },
          ],
          isError: true,
        }
      }
      const [parent] = await db
        .select()
        .from(scenarios)
        .where(and(eq(scenarios.id, anchor.scenarioId), eq(scenarios.mapId, mapId)))
      if (!parent) {
        return {
          content: [
            { type: 'text' as const, text: 'Anchor belongs to a different map.' },
          ],
          isError: true,
        }
      }
      const [newScenario] = await db
        .insert(scenarios)
        .values({
          mapId,
          name: args.name,
          description: args.description ?? null,
          color: args.color ?? parent.color,
        })
        .returning()

      const toInsert: {
        scenarioId: string
        nodeId: string
        nodeType: string
        order: number
        description: string | null
        trigger: string | null
        isAnchor: boolean
      }[] = []
      if (anchor.nodeId && anchor.nodeType) {
        toInsert.push({
          scenarioId: newScenario!.id,
          nodeId: anchor.nodeId,
          nodeType: anchor.nodeType,
          order: 1,
          description: null,
          trigger: null,
          isAnchor: false,
        })
      }
      for (const s of args.additionalSteps ?? []) {
        toInsert.push({
          scenarioId: newScenario!.id,
          nodeId: s.nodeId,
          nodeType: s.nodeType,
          order: 0,
          description: s.description,
          trigger: s.trigger ?? null,
          isAnchor: s.isAnchor ?? false,
        })
      }
      toInsert.forEach((s, i) => {
        s.order = i + 1
      })

      let inserted: { id: string; order: number }[] = []
      if (toInsert.length > 0) {
        inserted = await db
          .insert(scenarioSteps)
          .values(toInsert)
          .returning({ id: scenarioSteps.id, order: scenarioSteps.order })
      }

      await db.insert(scenarioConnections).values({
        mapId,
        fromScenarioId: anchor.scenarioId,
        fromStepId: anchor.id,
        toScenarioId: newScenario!.id,
        toStepId: null,
        condition: args.condition ?? null,
      })

      const stepLines = inserted
        .sort((a, b) => a.order - b.order)
        .map((s) => `  ${s.order}. stepId=${s.id}`)
        .join('\n')
      return {
        content: [
          {
            type: 'text' as const,
            text:
              `Created connected scenario "${args.name}" (${newScenario!.id}) branching from "${parent.name}" @ step ${anchor.order}${args.condition ? ` when "${args.condition}"` : ''}.` +
              (stepLines ? `\n\nStep IDs:\n${stepLines}` : ''),
          },
        ],
      }
    }
  )

  server.tool(
    'delete_scenario_connection',
    'Delete a scenario connection by id.',
    { connectionId: z.string() },
    async ({ connectionId }) => {
      const db = await getDb()
      await db.delete(scenarioConnections).where(eq(scenarioConnections.id, connectionId))
      return {
        content: [{ type: 'text' as const, text: `Deleted connection ${connectionId}` }],
      }
    }
  )
}
