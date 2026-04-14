import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../../db/client.ts'
import {
  productNodes,
  pageNodes,
  functionNodes,
  productPageMemberships,
} from '../../db/schema.ts'
import type { McpContext } from '../context.ts'

export function registerNodeTools(server: McpServer, ctx: McpContext) {
  const { mapId } = ctx

  server.tool(
    'get_service_map',
    'Get the full service map with all nodes and dependencies',
    {},
    async () => {
      const db = await getDb()
      const [dbProducts, dbPages, dbFunctions] = await Promise.all([
        db.select().from(productNodes).where(eq(productNodes.mapId, mapId)),
        db.select().from(pageNodes).where(eq(pageNodes.mapId, mapId)),
        db.select().from(functionNodes).where(eq(functionNodes.mapId, mapId)),
      ])
      const result = {
        products: dbProducts.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
          description: p.description,
          status: p.status,
        })),
        pages: dbPages.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          identifier: p.identifier,
          description: p.description,
          status: p.status,
          productNodeId: p.productNodeId,
          parentPageId: p.parentPageId,
        })),
        features: dbFunctions.map((f) => ({
          id: f.id,
          name: f.name,
          kind: f.kind,
          scope: f.scope,
          identifier: f.identifier,
          endpoint: f.endpoint,
          policy: f.policy,
          description: f.settings,
          status: f.status,
          pageNodeId: f.pageNodeId,
          parentFunctionId: f.parentFunctionId,
        })),
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      }
    }
  )

  server.tool(
    'get_node',
    'Get detailed information about a specific node',
    { nodeId: z.string(), nodeType: z.enum(['product', 'page', 'feature']) },
    async ({ nodeId, nodeType }) => {
      const db = await getDb()
      let node: Record<string, unknown> | null = null
      if (nodeType === 'product') {
        const [r] = await db.select().from(productNodes).where(eq(productNodes.id, nodeId))
        node = r ?? null
      } else if (nodeType === 'page') {
        const [r] = await db.select().from(pageNodes).where(eq(pageNodes.id, nodeId))
        node = r ?? null
      } else {
        const [r] = await db.select().from(functionNodes).where(eq(functionNodes.id, nodeId))
        node = r ?? null
      }
      if (!node) {
        return {
          content: [{ type: 'text' as const, text: 'Node not found' }],
          isError: true,
        }
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(node, null, 2) }] }
    }
  )

  server.tool(
    'create_product',
    'Create a new product node',
    { name: z.string(), role: z.string().optional(), description: z.string().optional() },
    async ({ name, role, description }) => {
      const db = await getDb()
      const [row] = await db
        .insert(productNodes)
        .values({ mapId, name, role: role ?? null, description: description ?? null })
        .returning()
      return { content: [{ type: 'text' as const, text: JSON.stringify({ id: row!.id }) }] }
    }
  )

  server.tool(
    'create_page',
    'Create a page or system node under a product',
    {
      name: z.string(),
      productNodeId: z.string(),
      kind: z.enum(['page', 'system']).default('page'),
      identifier: z.string().optional(),
      description: z.string().optional(),
      parentPageId: z.string().optional(),
    },
    async ({ name, productNodeId, kind, identifier, description, parentPageId }) => {
      const db = await getDb()
      const [row] = await db
        .insert(pageNodes)
        .values({
          mapId,
          name,
          productNodeId,
          kind,
          identifier: identifier ?? null,
          description: description ?? null,
          parentPageId: parentPageId ?? null,
        })
        .returning()
      if (row) {
        await db
          .insert(productPageMemberships)
          .values({ mapId, productNodeId, pageNodeId: row.id })
          .onConflictDoNothing()
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ id: row!.id }) }] }
    }
  )

  server.tool(
    'create_feature',
    'Create a feature or external API node. scope="page" nests it under a page; scope="shared" attaches it at map level.',
    {
      name: z.string(),
      kind: z.enum(['function', 'external_api']).default('function'),
      scope: z.enum(['page', 'shared']).default('page'),
      pageNodeId: z.string().optional(),
      parentFunctionId: z.string().optional(),
      identifier: z.string().optional(),
      description: z.string().optional(),
      policy: z.string().optional(),
      endpoint: z.string().optional(),
    },
    async (args) => {
      const db = await getDb()
      const [row] = await db
        .insert(functionNodes)
        .values({
          mapId,
          name: args.name,
          kind: args.kind,
          scope: args.scope,
          pageNodeId: args.scope === 'page' ? (args.pageNodeId ?? null) : null,
          parentFunctionId: args.parentFunctionId ?? null,
          identifier: args.identifier ?? null,
          settings: args.description ?? null,
          policy: args.policy ?? null,
          endpoint: args.endpoint ?? null,
        })
        .returning()
      return { content: [{ type: 'text' as const, text: JSON.stringify({ id: row!.id }) }] }
    }
  )

  server.tool(
    'update_node',
    'Update content fields or structural parent (productNodeId, parentPageId, pageNodeId, parentFunctionId) of a node. Reparenting preserves the node id so dependencies and scenario references stay intact.',
    {
      nodeId: z.string(),
      nodeType: z.enum(['product', 'page', 'feature']),
      name: z.string().optional(),
      description: z.string().optional(),
      identifier: z.string().optional(),
      role: z.string().optional(),
      policy: z.string().optional(),
      endpoint: z.string().optional(),
      status: z.string().optional(),
      productNodeId: z.string().nullable().optional(),
      parentPageId: z.string().nullable().optional(),
      pageNodeId: z.string().nullable().optional(),
      parentFunctionId: z.string().nullable().optional(),
    },
    async ({ nodeId, nodeType, ...updates }) => {
      const db = await getDb()
      const changed: string[] = []
      if (nodeType === 'product') {
        const data: Record<string, unknown> = {}
        if (updates.name) data.name = updates.name
        if (updates.role) data.role = updates.role
        if (updates.description) data.description = updates.description
        if (updates.status) data.status = updates.status
        if (Object.keys(data).length > 0) {
          await db.update(productNodes).set(data).where(eq(productNodes.id, nodeId))
          changed.push(...Object.keys(data))
        }
      } else if (nodeType === 'page') {
        const data: Record<string, unknown> = {}
        if (updates.name) data.name = updates.name
        if (updates.identifier) data.identifier = updates.identifier
        if (updates.description) data.description = updates.description
        if (updates.status) data.status = updates.status
        if (updates.productNodeId !== undefined) data.productNodeId = updates.productNodeId
        if (updates.parentPageId !== undefined) data.parentPageId = updates.parentPageId
        if (Object.keys(data).length > 0) {
          await db.update(pageNodes).set(data).where(eq(pageNodes.id, nodeId))
          changed.push(...Object.keys(data))
        }
      } else {
        const data: Record<string, unknown> = {}
        if (updates.name) data.name = updates.name
        if (updates.identifier) data.identifier = updates.identifier
        if (updates.description !== undefined) data.settings = updates.description
        if (updates.policy) data.policy = updates.policy
        if (updates.endpoint) data.endpoint = updates.endpoint
        if (updates.status) data.status = updates.status
        if (updates.parentFunctionId !== undefined) data.parentFunctionId = updates.parentFunctionId
        if (updates.pageNodeId !== undefined) data.pageNodeId = updates.pageNodeId
        if (Object.keys(data).length > 0) {
          await db.update(functionNodes).set(data).where(eq(functionNodes.id, nodeId))
          changed.push(...Object.keys(data))
        }
      }
      return {
        content: [
          {
            type: 'text' as const,
            text:
              changed.length > 0
                ? `Updated ${nodeType} ${nodeId} (${changed.join(', ')})`
                : `No changes applied to ${nodeType} ${nodeId}`,
          },
        ],
      }
    }
  )

  server.tool(
    'delete_node',
    'Delete a node. Cascades to children, dependencies, and scenario references. Call search_nodes or read get_node + dependencies first to avoid silent breakage.',
    { nodeId: z.string(), nodeType: z.enum(['product', 'page', 'feature']) },
    async ({ nodeId, nodeType }) => {
      const db = await getDb()
      if (nodeType === 'product') {
        await db.delete(productNodes).where(eq(productNodes.id, nodeId))
      } else if (nodeType === 'page') {
        await db.delete(pageNodes).where(eq(pageNodes.id, nodeId))
      } else {
        await db.delete(functionNodes).where(eq(functionNodes.id, nodeId))
      }
      return { content: [{ type: 'text' as const, text: `Deleted ${nodeType} ${nodeId}` }] }
    }
  )

  server.tool(
    'search_nodes',
    'Substring-match nodes by name or identifier across products, pages, and features. Case-insensitive.',
    {
      query: z.string(),
      types: z.array(z.enum(['product', 'page', 'feature'])).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ query, types, limit }) => {
      const db = await getDb()
      const q = query.trim()
      if (!q) {
        return {
          content: [{ type: 'text' as const, text: 'query must be non-empty' }],
          isError: true,
        }
      }
      const typeSet = new Set(types ?? ['product', 'page', 'feature'])
      const cap = limit ?? 20
      const pattern = `%${q}%`
      const results: { type: string; id: string; name: string; identifier: string | null }[] = []

      if (typeSet.has('product')) {
        const rows = await db
          .select({ id: productNodes.id, name: productNodes.name })
          .from(productNodes)
          .where(and(eq(productNodes.mapId, mapId), sql`${productNodes.name} ILIKE ${pattern}`))
          .limit(cap)
        for (const r of rows) {
          results.push({ type: 'product', id: r.id, name: r.name, identifier: null })
        }
      }
      if (typeSet.has('page')) {
        const rows = await db
          .select({ id: pageNodes.id, name: pageNodes.name, identifier: pageNodes.identifier })
          .from(pageNodes)
          .where(
            and(
              eq(pageNodes.mapId, mapId),
              sql`(${pageNodes.name} ILIKE ${pattern} OR ${pageNodes.identifier} ILIKE ${pattern})`
            )
          )
          .limit(cap)
        for (const r of rows) {
          results.push({ type: 'page', id: r.id, name: r.name, identifier: r.identifier })
        }
      }
      if (typeSet.has('feature')) {
        const rows = await db
          .select({
            id: functionNodes.id,
            name: functionNodes.name,
            identifier: functionNodes.identifier,
          })
          .from(functionNodes)
          .where(
            and(
              eq(functionNodes.mapId, mapId),
              sql`(${functionNodes.name} ILIKE ${pattern} OR ${functionNodes.identifier} ILIKE ${pattern})`
            )
          )
          .limit(cap)
        for (const r of rows) {
          results.push({ type: 'feature', id: r.id, name: r.name, identifier: r.identifier })
        }
      }

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No nodes match "${q}".` }] }
      }
      const lines = results.map(
        (r) => `- [${r.type}] ${r.name}${r.identifier ? ` ${r.identifier}` : ''} (${r.id})`
      )
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] }
    }
  )
}
