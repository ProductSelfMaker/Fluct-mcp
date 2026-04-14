#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from '../src/mcp/server.ts'

async function main() {
  const server = await createServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('[fluct-mcp] fatal:', err)
  process.exit(1)
})
