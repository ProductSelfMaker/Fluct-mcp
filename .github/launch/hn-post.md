# HN launch draft — v0.1.0

> Draft — review before submitting. Show HN rules: title ≤ 80 chars, no
> all-caps, clear value prop. Body: first person, concrete, link to repo
> above the fold.

## Title options

- `Show HN: Fluct-mcp – Self-hosted service map your AI coding agent can query`
- `Show HN: Fluct – An MCP server that tells your agent what it's about to break`
- `Show HN: Open-source AI-native memory for your codebase`

## Body

Hi HN — Fluct-mcp is a self-hosted MCP server that gives your coding agent (Claude Code, Cursor, Cline, Windsurf, anything MCP) a queryable graph of your codebase: products → pages → features, with dependencies, user scenarios, and per-node metadata (source files, test files, state touches, runtime context, I/O contract).

The reason I built this: vibe coding breaks silently. AI agents shipping 5x faster also break 5x more things — shared functions get edited without anyone noticing three pages depend on them, scenarios become orphaned after a refactor, and "what does this feature do?" becomes a multi-file grep every single session.

The core tool in the pack is `analyze_impact`. Before your agent deletes, renames, or rescopes anything, it calls `analyze_impact(nodeId)` and gets back the blast radius: incoming/outgoing edges, scenario steps that reference this node (with anchor status), child nodes, permissions, and change-kind-specific risk bullets. A README can't answer "what breaks if I change this" — a graph can.

Everything runs locally on PGlite (Postgres in WASM — no Docker, no Supabase, no cloud). Single command to boot:

```bash
npx -y fluct-mcp ui       # Whiteboard at http://localhost:3000
npx -y fluct-mcp          # stdio MCP for AI client config
```

Or wire it into your AI client directly:

```json
{ "mcpServers": { "fluct": { "command": "npx", "args": ["-y", "fluct-mcp"] } } }
```

Repo: https://github.com/ProductSelfMaker/Fluct-mcp

Apache 2.0. 28 MCP tools + `bootstrap_from_repo` / `sync_from_repo` prompts that turn a fresh repo into a full map in ~30 minutes. The whiteboard UI (React Flow) at `localhost:3000` is read-first by design — agents drive edits via MCP, humans verify visually.

Team features (orgs, OAuth for cloud agents, share links, project workflow) live at the hosted version (fluct.tools), but the map, MCP surface, analysis tools, and prompts are identical and here in open source.

Happy to answer questions. The project is 2 weeks old and I'm the solo maintainer — issues and feedback especially welcome.

## X / Twitter draft

Just open-sourced Fluct-mcp — a self-hosted MCP server that gives your coding agent a queryable graph of your codebase.

Before Claude/Cursor/Cline deletes or renames anything, it can call analyze_impact and see the blast radius: what scenarios reference this, which pages depend on it, what tests cover it.

Runs locally on PGlite, no Docker, no cloud. Apache 2.0.

`npx -y fluct-mcp`

github.com/ProductSelfMaker/Fluct-mcp

## Reddit r/LocalLLaMA draft

**Open-sourced: an MCP server that gives your local coding agent persistent memory of your codebase**

Posting because I think this community would actually use it. Fluct-mcp runs fully local — PGlite (Postgres-in-WASM), stdio MCP, no external services. Your agent gets tools to query the graph of your project (products/pages/features/dependencies/scenarios) and ask "what breaks if I change this" before touching anything.

28 MCP tools + 2 prompts (`bootstrap_from_repo` / `sync_from_repo`) that walk the agent through turning a fresh repo into a full map in ~30 minutes.

Install: `npx -y fluct-mcp`. Config snippet + repo in the README.

Apache 2.0: https://github.com/ProductSelfMaker/Fluct-mcp

Would love feedback — especially from anyone already running Claude Desktop / Cline / Continue.dev locally.
