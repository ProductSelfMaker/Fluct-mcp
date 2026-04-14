import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveContext } from './context.ts'
import { registerNodeTools } from './tools/nodes.ts'
import { registerDependencyTools } from './tools/dependencies.ts'
import { registerAiContextTools } from './tools/ai-context.ts'

export async function createServer(): Promise<McpServer> {
  const ctx = await resolveContext()
  const server = new McpServer({
    name: 'fluct-mcp',
    version: '0.1.0',
  })

  registerNodeTools(server, ctx)
  registerDependencyTools(server, ctx)
  registerAiContextTools(server, ctx)

  return server
}
