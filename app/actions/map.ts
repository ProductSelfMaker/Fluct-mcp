'use server'

import { and, asc, desc, eq } from 'drizzle-orm'
import {
  maps,
  productNodes,
  pageNodes,
  functionNodes,
  productNodeEdges,
  pageNodeEdges,
  functionEdges,
  pageFeatureEdges,
  scenarios,
  scenarioSteps,
  type AiContext,
} from '../../src/db/schema.ts'
import { getDb } from '../../src/db/client.ts'
import { loadConfig } from '../../src/config.ts'

// Server actions used by the OSS Next.js UI. Everything hits local
// PGlite directly — no Supabase, no auth layer. Single local user.

export async function ensureDefaultMap(): Promise<string> {
  const db = await getDb()
  const [latest] = await db.select().from(maps).orderBy(desc(maps.updatedAt)).limit(1)
  if (latest) return latest.id
  const cfg = loadConfig()
  const [created] = await db.insert(maps).values({ name: cfg.defaultMapName }).returning()
  if (!created) throw new Error('Failed to create default map')
  return created.id
}

export async function listMaps() {
  const db = await getDb()
  return db
    .select({ id: maps.id, name: maps.name, updatedAt: maps.updatedAt })
    .from(maps)
    .orderBy(desc(maps.updatedAt))
}

export async function loadMap(mapId: string) {
  const db = await getDb()
  const [map] = await db.select().from(maps).where(eq(maps.id, mapId))
  if (!map) return null

  const [dbProducts, dbPages, dbFunctions, dbPageFeatureEdges, dbPageEdges, dbFunctionEdges] =
    await Promise.all([
      db.select().from(productNodes).where(eq(productNodes.mapId, mapId)),
      db.select().from(pageNodes).where(eq(pageNodes.mapId, mapId)),
      db.select().from(functionNodes).where(eq(functionNodes.mapId, mapId)),
      db.select().from(pageFeatureEdges).where(eq(pageFeatureEdges.mapId, mapId)),
      db.select().from(pageNodeEdges).where(eq(pageNodeEdges.mapId, mapId)),
      db.select().from(functionEdges).where(eq(functionEdges.mapId, mapId)),
    ])

  const productEdges = await db
    .select()
    .from(productNodeEdges)
    .where(eq(productNodeEdges.mapId, mapId))

  return {
    map,
    products: dbProducts,
    pages: dbPages,
    functions: dbFunctions,
    edges: {
      productEdges,
      pageEdges: dbPageEdges,
      functionEdges: dbFunctionEdges,
      pageFeatureEdges: dbPageFeatureEdges,
    },
  }
}

export type NodeDetail = {
  id: string
  type: 'product' | 'page' | 'feature'
  name: string
  identifier: string | null
  description: string | null
  policy: string | null
  endpoint: string | null
  role: string | null
  status: string
  scope: string | null
  kind: string | null
  aiContext: AiContext
}

export async function loadNode(
  nodeId: string,
  nodeType: 'product' | 'page' | 'feature'
): Promise<NodeDetail | null> {
  const db = await getDb()
  if (nodeType === 'product') {
    const [r] = await db.select().from(productNodes).where(eq(productNodes.id, nodeId))
    if (!r) return null
    return {
      id: r.id,
      type: 'product',
      name: r.name,
      identifier: null,
      description: r.description,
      policy: null,
      endpoint: null,
      role: r.role,
      status: r.status,
      scope: null,
      kind: null,
      aiContext: r.aiContext,
    }
  }
  if (nodeType === 'page') {
    const [r] = await db.select().from(pageNodes).where(eq(pageNodes.id, nodeId))
    if (!r) return null
    return {
      id: r.id,
      type: 'page',
      name: r.name,
      identifier: r.identifier,
      description: r.description,
      policy: null,
      endpoint: null,
      role: null,
      status: r.status,
      scope: null,
      kind: r.kind,
      aiContext: r.aiContext,
    }
  }
  const [r] = await db.select().from(functionNodes).where(eq(functionNodes.id, nodeId))
  if (!r) return null
  return {
    id: r.id,
    type: 'feature',
    name: r.name,
    identifier: r.identifier,
    description: r.settings,
    policy: r.policy,
    endpoint: r.endpoint,
    role: null,
    status: r.status,
    scope: r.scope,
    kind: r.kind,
    aiContext: r.aiContext,
  }
}

export async function listScenariosForMap(mapId: string) {
  const db = await getDb()
  return db
    .select({
      id: scenarios.id,
      name: scenarios.name,
      color: scenarios.color,
      description: scenarios.description,
    })
    .from(scenarios)
    .where(eq(scenarios.mapId, mapId))
    .orderBy(asc(scenarios.createdAt))
}

export async function loadScenarioSteps(scenarioId: string) {
  const db = await getDb()
  const [scenario] = await db.select().from(scenarios).where(eq(scenarios.id, scenarioId))
  if (!scenario) return null
  const steps = await db
    .select()
    .from(scenarioSteps)
    .where(eq(scenarioSteps.scenarioId, scenarioId))
    .orderBy(asc(scenarioSteps.order))
  return { scenario, steps }
}

void and
