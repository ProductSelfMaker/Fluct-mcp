# Fluct-mcp
AI-native service map for coding agents. Standard MCP, runs locally. The open core of Fluct.

# Fluct

  AI-native service map for coding agents. Self-hosted, standard MCP,
  queryable by any MCP-compatible AI client.

  Stop vibe coding blind — let your agent see the whole graph before
  it touches anything.

## What it does

  - Keep your codebase architecture as a queryable graph: products → pages → features, with dependencies and user scenarios.
  - Any MCP-compatible coding agent (Claude Code, Cursor, Cline, Windsurf, ...) reads the graph before making changes.
  - `analyze_impact` tells your agent what would break *before* it
    deletes, renames, or rescopes anything.
  - Bootstrapping prompts walk the agent through turning a fresh repo
    into a complete map in ~30 minutes.

 ## Quick start

  ```bash
  git clone https://github.com/YOUR_ORG/fluct-mcp
  cd fluct-mcp
  docker compose up    # or: npm install && npx fluct-mcp

  Then in your AI client, add the MCP server:

  {
    "mcpServers": {
      "fluct": { "command": "npx", "args": ["fluct-mcp"] }
    }
  }

  Open http://localhost:3000 for the whiteboard UI.

  Hosted version

  For team features (organizations, shared maps, cloud-agent OAuth),
  visit fluct.tools.

  License

  Apache 2.0.

  (I'll scaffold full README with badges, screenshots, features list in Phase 0.)

  ---

  **5. .gitignore (Next.js + PGlite 반영)**

  ```gitignore
  # dependencies
  node_modules/
  .pnp
  .pnp.*

  # next.js
  .next/
  out/
  build/

  # env
  .env
  .env.local
  .env.*.local

  # local db (PGlite)
  *.db
  *.db-journal
  .fluct/

  # logs
  *.log
  npm-debug.log*

  # OS
  .DS_Store
  Thumbs.db

  # IDE
  .vscode/
  .idea/
  *.swp

  # coverage
  coverage/
  .nyc_output/

  # vercel
  .vercel/

  # typescript
  *.tsbuildinfo
  next-env.d.ts
