#!/usr/bin/env node
// Fluct-mcp CLI router.
//
//   fluct-mcp                  → stdio MCP server (default, for agents)
//   fluct-mcp ui               → launch the Next.js UI at localhost:3000
//   fluct-mcp migrate          → run / re-run database migrations
//
// Designed so an AI client config can use the bare `npx -y fluct-mcp`
// invocation and a human can use `npx -y fluct-mcp ui` to open the
// whiteboard in a browser.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const subcommand = process.argv[2]

async function runStdioMcp() {
  const { StdioServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/stdio.js'
  )
  const { createServer } = await import('../src/mcp/server.ts')
  const server = await createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

async function runMigrate() {
  // Import for side effects — the module's top-level `run()` executes
  // on import.
  await import('../src/db/migrate.ts')
}

function runUi() {
  // When published via npm the compiled bin lives at
  // `<pkg>/dist/bin/fluct-mcp.js`; the standalone Next.js server is a
  // sibling of `dist/`, at `<pkg>/.next/standalone/server.js`. In the
  // source tree (`npm run dev` style) it's at `<cwd>/.next/standalone/`.
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    // Published layout: fluct-mcp/dist/bin/ → fluct-mcp/.next/standalone/
    resolve(here, '..', '..', '.next', 'standalone', 'server.js'),
    // Source-tree layout (tsx dev): bin/ → .next/standalone/
    resolve(here, '..', '.next', 'standalone', 'server.js'),
  ]
  const serverPath = candidates.find((p) => existsSync(p))
  if (!serverPath) {
    console.error(
      '[fluct-mcp] No UI build found. Did you forget `npm run mcp:build`?\n' +
        '            Looked in: ' +
        candidates.join(', ')
    )
    process.exit(1)
  }
  const port = process.env.PORT || '3000'
  const host = process.env.HOSTNAME || '127.0.0.1'
  process.stderr.write(
    `\n  Fluct UI  →  http://${host}:${port}\n  (Ctrl-C to stop)\n\n`
  )
  const child = spawn(process.execPath, [serverPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: port, HOSTNAME: host },
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}

async function main() {
  if (!subcommand) {
    await runStdioMcp()
    return
  }
  if (subcommand === 'ui' || subcommand === 'serve') {
    runUi()
    return
  }
  if (subcommand === 'migrate' || subcommand === 'db:init') {
    await runMigrate()
    return
  }
  if (subcommand === '-h' || subcommand === '--help' || subcommand === 'help') {
    process.stdout.write(
      [
        'fluct-mcp — AI-native service map for coding agents',
        '',
        'Usage:',
        '  fluct-mcp                 Start the stdio MCP server (for AI clients)',
        '  fluct-mcp ui              Launch the web UI at http://localhost:3000',
        '  fluct-mcp migrate         Run database migrations',
        '  fluct-mcp help            Show this help',
        '',
        'Environment:',
        '  FLUCT_DB_PATH             Database directory (default: ~/.fluct/db)',
        '  FLUCT_MAP_ID              Pin to a specific map id',
        '  FLUCT_DEFAULT_MAP         Name of the auto-created default map',
        '  PORT                      UI port (default: 3000)',
        '',
      ].join('\n')
    )
    return
  }
  console.error(`[fluct-mcp] Unknown subcommand: ${subcommand}`)
  console.error('            Try `fluct-mcp help`.')
  process.exit(2)
}

main().catch((err) => {
  console.error('[fluct-mcp] fatal:', err)
  process.exit(1)
})
