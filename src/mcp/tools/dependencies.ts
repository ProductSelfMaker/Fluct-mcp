import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db/client.ts'
import {
  productNodeEdges,
  pageNodeEdges,
  functionEdges,
  pageFeatureEdges,
} from '../../db/schema.ts'
import type { McpContext } from '../context.ts'

export function registerDependencyTools(server: McpServer, ctx: McpContext) {
  const { mapId } = ctx

  server.tool(
    'add_dependency',
    'Add a dependency edge. nodeType=page_to_feature links a page to a feature (typically a shared function). Idempotent: repeat calls return the existing edge.',
    {
      sourceId: z.string(),
      targetId: z.string(),
      nodeType: z.enum(['product', 'page', 'feature', 'page_to_feature']),
      description: z.string().optional(),
    },
    async ({ sourceId, targetId, nodeType, description }) => {
      const db = await getDb()
      if (sourceId === targetId) {
        return {
          content: [{ type: 'text' as const, text: 'Source and target cannot be the same node.' }],
          isError: true,
        }
      }

      if (nodeType === 'product') {
        const [existing] = await db
          .select({ id: productNodeEdges.id })
          .from(productNodeEdges)
          .where(
            and(
              eq(productNodeEdges.mapId, mapId),
              eq(productNodeEdges.sourceProductId, sourceId),
              eq(productNodeEdges.targetProductId, targetId)
            )
          )
        if (existing) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ edgeId: existing.id, existed: true }) },
            ],
          }
        }
        const [row] = await db
          .insert(productNodeEdges)
          .values({
            mapId,
            sourceProductId: sourceId,
            targetProductId: targetId,
            description: description ?? null,
          })
          .returning()
        return { content: [{ type: 'text' as const, text: JSON.stringify({ edgeId: row!.id }) }] }
      } else if (nodeType === 'page') {
        const [existing] = await db
          .select({ id: pageNodeEdges.id })
          .from(pageNodeEdges)
          .where(
            and(
              eq(pageNodeEdges.mapId, mapId),
              eq(pageNodeEdges.sourceId, sourceId),
              eq(pageNodeEdges.targetId, targetId)
            )
          )
        if (existing) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ edgeId: existing.id, existed: true }) },
            ],
          }
        }
        const [row] = await db
          .insert(pageNodeEdges)
          .values({ mapId, sourceId, targetId, description: description ?? null })
          .returning()
        return { content: [{ type: 'text' as const, text: JSON.stringify({ edgeId: row!.id }) }] }
      } else if (nodeType === 'page_to_feature') {
        const [existing] = await db
          .select({ id: pageFeatureEdges.id })
          .from(pageFeatureEdges)
          .where(
            and(
              eq(pageFeatureEdges.mapId, mapId),
              eq(pageFeatureEdges.sourcePageId, sourceId),
              eq(pageFeatureEdges.targetFunctionId, targetId)
            )
          )
        if (existing) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ edgeId: existing.id, existed: true }) },
            ],
          }
        }
        const [row] = await db
          .insert(pageFeatureEdges)
          .values({
            mapId,
            sourcePageId: sourceId,
            targetFunctionId: targetId,
            description: description ?? null,
          })
          .returning()
        return { content: [{ type: 'text' as const, text: JSON.stringify({ edgeId: row!.id }) }] }
      } else {
        const [existing] = await db
          .select({ id: functionEdges.id })
          .from(functionEdges)
          .where(
            and(
              eq(functionEdges.mapId, mapId),
              eq(functionEdges.sourceFunctionId, sourceId),
              eq(functionEdges.targetFunctionId, targetId)
            )
          )
        if (existing) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ edgeId: existing.id, existed: true }) },
            ],
          }
        }
        const [row] = await db
          .insert(functionEdges)
          .values({
            mapId,
            sourceFunctionId: sourceId,
            targetFunctionId: targetId,
            description: description ?? null,
          })
          .returning()
        return { content: [{ type: 'text' as const, text: JSON.stringify({ edgeId: row!.id }) }] }
      }
    }
  )

  server.tool(
    'remove_dependency',
    'Remove a dependency edge by id + type.',
    {
      edgeId: z.string(),
      nodeType: z.enum(['product', 'page', 'feature', 'page_to_feature']),
    },
    async ({ edgeId, nodeType }) => {
      const db = await getDb()
      if (nodeType === 'product') {
        await db.delete(productNodeEdges).where(eq(productNodeEdges.id, edgeId))
      } else if (nodeType === 'page') {
        await db.delete(pageNodeEdges).where(eq(pageNodeEdges.id, edgeId))
      } else if (nodeType === 'page_to_feature') {
        await db.delete(pageFeatureEdges).where(eq(pageFeatureEdges.id, edgeId))
      } else {
        await db.delete(functionEdges).where(eq(functionEdges.id, edgeId))
      }
      return { content: [{ type: 'text' as const, text: `Removed dependency ${edgeId}` }] }
    }
  )
}
