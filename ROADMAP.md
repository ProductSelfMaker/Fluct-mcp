# Roadmap

## Phase 0 — Scaffolding ✅
_current_

- [x] Repo initialized (Apache 2.0, Node `.gitignore`)
- [x] README, CONTRIBUTING, ROADMAP
- [x] PGlite-aware `.gitignore` extensions
- [x] `docker-compose.yml` skeleton
- [x] `package.json` with target package name (`fluct-mcp`)
- [ ] Repo description + topics set on GitHub

## Phase 1 — Core port (in progress)

Goal: `npx fluct-mcp` works end-to-end with stdio MCP and a local PGlite database, no Supabase, no Vercel.

- [x] Drizzle schema ported (maps / nodes / edges / scenarios / permissions / comments / snapshots)
- [x] Consolidated `0001_init.sql` migration — idempotent, `IF NOT EXISTS` everywhere
- [x] PGlite adapter (`drizzle-orm/pglite`) + migration runner
- [x] Single-user auth stub — auto-creates default map on first run, `FLUCT_MAP_ID` override
- [x] `bin/fluct-mcp.ts` stdio entry point
- [x] Core MCP tools: `get_service_map`, `get_node`, `create_product`, `create_page`, `create_feature`, `update_node`, `delete_node`, `search_nodes`, `add_dependency` (idempotent), `remove_dependency`, `update_ai_context`
- [ ] Scenario tools (`create_scenario`, steps, anchors, connections)
- [ ] `analyze_impact` — the kick feature
- [ ] Bootstrap + sync prompts (`bootstrap_from_repo`, `sync_from_repo`)
- [ ] Snapshot + comment tools
- [ ] First npm release (`fluct-mcp@0.1.0` → 0.2.0 once scenarios land)

## Phase 2 — Whiteboard UI (~1 week)

Goal: `npm run dev` serves the map editor at `localhost:3000`, single-user, no login.

- [ ] Port `app/map/[mapId]` route + editor client
- [ ] Port `app/dashboard` (personal map list only)
- [ ] OSS-mode conditional rendering: hide org/OAuth/share/project UI
- [ ] Port whiteboard canvas + scenario editor + side panel + AI context tab
- [ ] Seed first map automatically on first run

## Phase 3 — Release prep (~3 days)

- [ ] `docker-compose.yml` real (UI + PGlite)
- [ ] Screenshots / demo GIF in README
- [ ] npm publish of `fluct-mcp` binary (stdio MCP shipping alone)
- [ ] Launch posts (HN, X, r/LocalLLaMA)

## Later

- [ ] Separate `@fluct/core` into its own package (monorepo cleanup)
- [ ] Plugin API for custom MCP tools
- [ ] SQLite backend option (for users who can't run WASM Postgres)
- [ ] Import / export between OSS and hosted
