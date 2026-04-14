# Roadmap

## Phase 0 — Scaffolding ✅
_current_

- [x] Repo initialized (Apache 2.0, Node `.gitignore`)
- [x] README, CONTRIBUTING, ROADMAP
- [x] PGlite-aware `.gitignore` extensions
- [x] `docker-compose.yml` skeleton
- [x] `package.json` with target package name (`fluct-mcp`)
- [ ] Repo description + topics set on GitHub

## Phase 1 — Core port ✅

Goal: `npx fluct-mcp` works end-to-end with stdio MCP and a local PGlite database, no Supabase, no Vercel. **Done.**

- [x] Drizzle schema ported (maps / nodes / edges / scenarios / permissions / comments / snapshots)
- [x] Consolidated `0001_init.sql` migration — idempotent, `IF NOT EXISTS` everywhere
- [x] PGlite adapter (`drizzle-orm/pglite`) + migration runner
- [x] Single-user auth stub — auto-creates default map on first run, `FLUCT_MAP_ID` override
- [x] `bin/fluct-mcp.ts` stdio entry point
- [x] Node tools: `get_service_map`, `get_node`, `create_product`, `create_page`, `create_feature`, `update_node`, `delete_node`, `search_nodes`
- [x] Dependency tools: `add_dependency` (idempotent), `remove_dependency`
- [x] AI-context tool: `update_ai_context` (all five sub-fields)
- [x] **Impact analysis: `analyze_impact` — the kick feature**
- [x] Scenario tools: `get_scenarios`, `get_scenario_steps`, `create_scenario`, `update_scenario_step`, `remove_scenario_step`, `delete_scenario`, `toggle_step_anchor`, `get_anchors`, `get_scenario_connections`, `create_scenario_connection` (cycle-detected), `create_scenario_from_anchor` (one-shot branching), `delete_scenario_connection`
- [x] Snapshot + comment tools: `list_snapshots`, `create_snapshot`, `list_comments`, `add_comment`
- [x] Prompts: `bootstrap_from_repo`, `sync_from_repo` (copied verbatim from hosted Fluct — vendor-neutral already)
- [ ] First npm release (`fluct-mcp@0.1.0`)

**Surface total**: 28 MCP tools + 2 prompts. Parity with hosted Fluct for the single-user path.

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
