import { eq, desc } from 'drizzle-orm'
import { getDb } from '../db/client.ts'
import { maps } from '../db/schema.ts'
import { loadConfig } from '../config.ts'

// OSS single-user auth model: we don't have org membership or API
// keys. The MCP session always operates against a single map ID.
// Selection priority:
//   1. FLUCT_MAP_ID env (explicit override)
//   2. The most recently updated map in the local DB
//   3. Auto-create a default map if the DB is empty
export interface McpContext {
  mapId: string
  // Author tag stamped on comments and other write actions.
  userId: string
}

export async function resolveContext(): Promise<McpContext> {
  const cfg = loadConfig()
  const explicit = process.env.FLUCT_MAP_ID?.trim()
  const db = await getDb()

  if (explicit) {
    const [row] = await db.select().from(maps).where(eq(maps.id, explicit))
    if (!row) {
      throw new Error(
        `FLUCT_MAP_ID=${explicit} does not match any map in the local database.`
      )
    }
    return { mapId: row.id, userId: 'local' }
  }

  const [latest] = await db.select().from(maps).orderBy(desc(maps.updatedAt)).limit(1)
  if (latest) {
    return { mapId: latest.id, userId: 'local' }
  }

  const [created] = await db.insert(maps).values({ name: cfg.defaultMapName }).returning()
  if (!created) throw new Error('Failed to create default map.')
  return { mapId: created.id, userId: 'local' }
}
