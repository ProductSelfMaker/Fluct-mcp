import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client.ts'
import { productNodes, pageNodes, functionNodes, type AiContext } from '../../db/schema.ts'
import type { McpContext } from '../context.ts'

export function registerAiContextTools(server: McpServer, _ctx: McpContext) {
  server.tool(
    'update_ai_context',
    'Write the AI-context metadata fields on a node — source files, test files, state touches (DB tables and external APIs), runtime context (cron/Edge/Realtime/webhook facts), and (features only) an I/O contract. Agent-owned metadata; the UI shows it read-only. Call during bootstrap and after code changes. Any omitted field is left unchanged; to clear a field, pass an empty array or empty string.',
    {
      nodeId: z.string(),
      nodeType: z.enum(['product', 'page', 'feature']),
      sourceFiles: z.array(z.string()).optional(),
      testFiles: z.array(z.string()).optional(),
      stateTouches: z.array(z.string()).optional(),
      runtimeContext: z.array(z.string()).optional(),
      ioContract: z
        .object({
          inputs: z.string().optional(),
          outputs: z.string().optional(),
          sideEffects: z.array(z.string()).optional(),
        })
        .optional(),
    },
    async ({ nodeId, nodeType, sourceFiles, testFiles, stateTouches, runtimeContext, ioContract }) => {
      const db = await getDb()
      let current: { aiContext: AiContext } | undefined
      if (nodeType === 'product') {
        const [r] = await db
          .select({ aiContext: productNodes.aiContext })
          .from(productNodes)
          .where(eq(productNodes.id, nodeId))
        current = r
      } else if (nodeType === 'page') {
        const [r] = await db
          .select({ aiContext: pageNodes.aiContext })
          .from(pageNodes)
          .where(eq(pageNodes.id, nodeId))
        current = r
      } else {
        const [r] = await db
          .select({ aiContext: functionNodes.aiContext })
          .from(functionNodes)
          .where(eq(functionNodes.id, nodeId))
        current = r
      }
      if (!current) {
        return {
          content: [{ type: 'text' as const, text: `Node ${nodeId} not found` }],
          isError: true,
        }
      }

      const prior = current.aiContext ?? {}
      const next: AiContext = {
        ...prior,
        ...(sourceFiles !== undefined ? { sourceFiles } : {}),
        ...(testFiles !== undefined ? { testFiles } : {}),
        ...(stateTouches !== undefined ? { stateTouches } : {}),
        ...(runtimeContext !== undefined ? { runtimeContext } : {}),
        ...(ioContract !== undefined
          ? { ioContract: { ...(prior.ioContract ?? {}), ...ioContract } }
          : {}),
      }

      if (nodeType === 'product') {
        await db.update(productNodes).set({ aiContext: next }).where(eq(productNodes.id, nodeId))
      } else if (nodeType === 'page') {
        await db.update(pageNodes).set({ aiContext: next }).where(eq(pageNodes.id, nodeId))
      } else {
        await db.update(functionNodes).set({ aiContext: next }).where(eq(functionNodes.id, nodeId))
      }

      const touched: string[] = []
      if (sourceFiles !== undefined) touched.push('sourceFiles')
      if (testFiles !== undefined) touched.push('testFiles')
      if (stateTouches !== undefined) touched.push('stateTouches')
      if (runtimeContext !== undefined) touched.push('runtimeContext')
      if (ioContract !== undefined) touched.push('ioContract')
      return {
        content: [
          {
            type: 'text' as const,
            text: `Updated AI context on ${nodeType} ${nodeId} (${touched.join(', ') || 'no-op'})`,
          },
        ],
      }
    }
  )
}
