import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from './schema.ts'
import { loadConfig } from '../config.ts'

// Lazy singleton. First call opens the DB; subsequent calls return the
// same connection. Phase 1 is PGlite-only for zero-setup. External
// Postgres support (via FLUCT_DATABASE_URL) lands in Phase 2 with an
// optional `pg` peer dep.

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null
let pglite: PGlite | null = null

async function openPglite(): Promise<PGlite> {
  if (pglite) return pglite
  const cfg = loadConfig()
  if (!existsSync(dirname(cfg.dbPath))) {
    mkdirSync(dirname(cfg.dbPath), { recursive: true })
  }
  pglite = new PGlite(cfg.dbPath)
  await pglite.waitReady
  return pglite
}

export async function getDb() {
  if (cached) return cached
  const client = await openPglite()
  cached = drizzle(client, { schema })
  return cached
}

/** Execute a raw multi-statement SQL string. Used by migrate.ts. */
export async function executeRaw(sql: string): Promise<void> {
  const client = await openPglite()
  await client.exec(sql)
}

export { schema }
