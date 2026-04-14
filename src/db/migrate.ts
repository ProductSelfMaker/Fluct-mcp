import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { executeRaw } from './client.ts'

// Minimal migration runner. Reads every .sql file in this directory's
// ./migrations subfolder in lexical order and executes it. Each file
// is expected to be idempotent (CREATE TABLE IF NOT EXISTS, etc.) so
// re-running on an already-migrated DB is a no-op.
//
// We deliberately don't track which migrations have been applied — the
// "everything is IF NOT EXISTS" convention covers the OSS case well
// enough and keeps the bootstrap story to a single script.

async function run() {
  const hereDir = dirname(fileURLToPath(import.meta.url))
  const migrationsDir = join(hereDir, 'migrations')

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.warn('No migration files found in', migrationsDir)
    return
  }

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    process.stderr.write(`→ ${file} … `)
    try {
      await executeRaw(sql)
      process.stderr.write('ok\n')
    } catch (e) {
      process.stderr.write('FAILED\n')
      throw e
    }
  }

  console.log('Database ready.')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
