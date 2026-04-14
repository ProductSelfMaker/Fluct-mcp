import { homedir } from 'node:os'
import { join } from 'node:path'

// Runtime configuration pulled from env. All fields have sensible
// defaults so first-run users don't need to touch anything.

export interface Config {
  /** Absolute path to the PGlite database directory. */
  dbPath: string
  /** Optional external Postgres URL. When set, takes precedence over dbPath. */
  databaseUrl: string | null
  /** Name used for the auto-created default map on first run. */
  defaultMapName: string
}

export function loadConfig(): Config {
  const rawDbPath = process.env.FLUCT_DB_PATH?.trim()
  const dbPath = rawDbPath && rawDbPath.length > 0 ? rawDbPath : join(homedir(), '.fluct', 'db')

  const databaseUrl = process.env.FLUCT_DATABASE_URL?.trim() || null

  const defaultMapName = process.env.FLUCT_DEFAULT_MAP?.trim() || 'My Service'

  return { dbPath, databaseUrl, defaultMapName }
}
