# Fluct

**AI-native service map for coding agents.** Self-hosted, standard MCP, queryable by any MCP-compatible AI client.

Stop vibe coding blind — let your agent see the whole graph before it touches anything.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-8b5cf6.svg)](https://modelcontextprotocol.io)

> 🚧 **Phase 1 partial — stdio MCP works.** Core CRUD + AI context tools run end-to-end against a local PGlite DB. Scenarios, analyze_impact, and the whiteboard UI are still landing (see [`ROADMAP.md`](./ROADMAP.md)).

---

## What it does

- **Keep your codebase architecture as a queryable graph** — products → pages → features, with dependencies and user scenarios captured as first-class data, not prose in a README.
- **Any MCP-compatible coding agent** (Claude Code, Cursor, Cline, Windsurf, Continue.dev, Zed) reads the graph before making changes.
- **`analyze_impact`** tells your agent what would break *before* it deletes, renames, or rescopes anything.
- **Bootstrap prompts** walk an agent through turning a fresh repo into a complete map in ~30 minutes.
- **AI context fields** per node (source files, test files, state touches, runtime context, I/O contract) — your agent knows where to look, without grep.

## Status

This is the **open core** of [fluct.tools](https://fluct.tools) — same MCP server, same service map, same scenario editor, built for local / self-hosted use.

| Feature | OSS | Hosted |
|---|---|---|
| Personal service map (CRUD, dependencies, scenarios) | ✅ | ✅ |
| MCP server (30+ tools, prompts, analyze_impact) | ✅ | ✅ |
| Whiteboard UI, scenario playback, snapshots | ✅ | ✅ |
| Markdown export | ✅ | ✅ |
| Organizations + members + roles | ❌ | ✅ |
| Cloud-agent OAuth 2.1 | ❌ | ✅ |
| Public share links | ❌ | ✅ |
| Project workflow (focused dev) | ❌ | ✅ |

## Quick start

```bash
git clone https://github.com/ProductSelfMaker/Fluct-mcp
cd Fluct-mcp
npm install
npm run db:init       # initializes local PGlite DB at ~/.fluct/db
npm run dev           # runs the stdio MCP server on stdin/stdout
```

Register in your AI client config (Claude Code / Cursor / etc.):

```json
{
  "mcpServers": {
    "fluct": { "command": "npx", "args": ["fluct-mcp"] }
  }
}
```

By default the server opens (or auto-creates) a map stored at `~/.fluct/db`. Override with `FLUCT_DB_PATH` or `FLUCT_MAP_ID` — see [`.env.example`](./.env.example).

> The whiteboard UI and Docker image land in Phase 2 (see [`ROADMAP.md`](./ROADMAP.md)). Phase 1 is MCP-only.

## Tech stack (planned)

- **Next.js 16** (App Router) — UI + MCP endpoint
- **Drizzle ORM** — schema identical to hosted Fluct
- **[PGlite](https://electric-sql.com/product/pglite)** — Postgres in-process, single file, zero external dependency
- **React Flow (@xyflow)** — whiteboard canvas
- **MCP SDK** — `@modelcontextprotocol/sdk`, stdio + HTTP transport

## Differences from hosted Fluct

The hosted version at `fluct.tools` adds multi-user features (orgs, OAuth for cloud agents, share links, projects, MCP concurrency lock). Everything else — the map, the MCP surface, the analysis tools, the prompts — is identical and lives here.

Architecture split via a single env flag (`FLUCT_MODE=oss` vs `saas`).

## Contributing

Before Phase 1 ships, issues and discussions are the fastest way to help. PRs welcome once the code is here.

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

Apache 2.0 — see [`LICENSE`](./LICENSE).

## Related

- [fluct.tools](https://fluct.tools) — hosted version with team features
- [Model Context Protocol](https://modelcontextprotocol.io) — the open standard this server speaks
