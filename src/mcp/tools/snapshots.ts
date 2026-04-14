import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { desc, eq, sql } from 'drizzle-orm'
import { getDb } from '../../db/client.ts'
import {
  maps,
  mapSnapshots,
  productNodes,
  pageNodes,
  functionNodes,
  nodeComments,
} from '../../db/schema.ts'
import type { McpContext } from '../context.ts'

export function registerSnapshotAndCommentTools(server: McpServer, ctx: McpContext) {
  const { mapId, userId } = ctx

  server.tool(
    'list_snapshots',
    'List versioned snapshots of the current map, most recent first.',
    {},
    async () => {
      const db = await getDb()
      const rows = await db
        .select({
          id: mapSnapshots.id,
          version: mapSnapshots.version,
          versionLabel: mapSnapshots.versionLabel,
          createdAt: mapSnapshots.createdAt,
        })
        .from(mapSnapshots)
        .where(eq(mapSnapshots.mapId, mapId))
        .orderBy(desc(mapSnapshots.version))
      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No snapshots yet for this map.' }] }
      }
      const lines = rows.map((r) => {
        const date = r.createdAt.toISOString().slice(0, 16).replace('T', ' ')
        const label = r.versionLabel ? ` — ${r.versionLabel}` : ''
        return `- v${r.version} · ${date}${label}`
      })
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )

  server.tool(
    'create_snapshot',
    'Save a versioned snapshot of the current map (products + pages + features). Use as a checkpoint before a large restructure.',
    { versionLabel: z.string().optional() },
    async ({ versionLabel }) => {
      const db = await getDb()
      const [allProducts, allPages, allFunctions] = await Promise.all([
        db.select().from(productNodes).where(eq(productNodes.mapId, mapId)),
        db.select().from(pageNodes).where(eq(pageNodes.mapId, mapId)),
        db.select().from(functionNodes).where(eq(functionNodes.mapId, mapId)),
      ])

      await db
        .update(maps)
        .set({
          version: sql`${maps.version} + 1`,
          versionLabel: versionLabel ?? null,
          updatedAt: new Date(),
        })
        .where(eq(maps.id, mapId))

      const [updatedMap] = await db
        .select({ version: maps.version })
        .from(maps)
        .where(eq(maps.id, mapId))

      const graph = JSON.parse(
        JSON.stringify({ products: allProducts, pages: allPages, functions: allFunctions })
      )

      const [snap] = await db
        .insert(mapSnapshots)
        .values({
          mapId,
          version: updatedMap?.version ?? 1,
          versionLabel: versionLabel ?? null,
          graphJson: graph,
        })
        .returning({ id: mapSnapshots.id, version: mapSnapshots.version })

      return {
        content: [
          {
            type: 'text' as const,
            text: `Created snapshot v${snap!.version}${versionLabel ? ` ("${versionLabel}")` : ''} capturing ${allProducts.length} products, ${allPages.length} pages, ${allFunctions.length} features.`,
          },
        ],
      }
    }
  )

  // ── Comments (single-user audit trail) ──────────────────────────────────

  server.tool(
    'list_comments',
    'List comments on a node. Useful before a change to review prior AI-written audit notes.',
    {
      nodeId: z.string(),
      includeResolved: z.boolean().optional(),
    },
    async ({ nodeId, includeResolved }) => {
      const db = await getDb()
      const rows = await db
        .select({
          id: nodeComments.id,
          content: nodeComments.content,
          resolved: nodeComments.resolved,
          authorId: nodeComments.authorId,
          createdAt: nodeComments.createdAt,
        })
        .from(nodeComments)
        .where(
          includeResolved
            ? eq(nodeComments.nodeId, nodeId)
            : sql`${nodeComments.nodeId} = ${nodeId} AND ${nodeComments.mapId} = ${mapId} AND ${nodeComments.resolved} = false`
        )
      if (rows.length === 0) {
        return { content: [{ type: 'text' as const, text: `No comments on node ${nodeId}.` }] }
      }
      const lines = rows.map((r) => {
        const flag = r.resolved ? ' [resolved]' : ''
        const date = r.createdAt.toISOString().slice(0, 16).replace('T', ' ')
        const preview = r.content.length > 200 ? r.content.slice(0, 200) + '…' : r.content
        return `- ${r.id}${flag} · ${date}\n  ${preview.replace(/\n/g, '\n  ')}`
      })
      return { content: [{ type: 'text' as const, text: lines.join('\n\n') }] }
    }
  )

  server.tool(
    'add_comment',
    'Leave a comment on a node. Use to explain WHY a restructure, rename, or scope change was made — visible to humans later.',
    { nodeId: z.string(), content: z.string().min(1) },
    async ({ nodeId, content }) => {
      const db = await getDb()
      const [comment] = await db
        .insert(nodeComments)
        .values({ nodeId, mapId, authorId: userId, content })
        .returning()
      return {
        content: [
          { type: 'text' as const, text: `Added comment ${comment!.id} on node ${nodeId}` },
        ],
      }
    }
  )
}
