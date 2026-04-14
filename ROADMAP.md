# Roadmap

## Phase 0 — Scaffolding ✅
_current_

- [x] Repo initialized (Apache 2.0, Node `.gitignore`)
- [x] README, CONTRIBUTING, ROADMAP
- [x] PGlite-aware `.gitignore` extensions
- [x] `docker-compose.yml` skeleton
- [x] `package.json` with target package name (`fluct-mcp`)
- [ ] Repo description + topics set on GitHub

## Phase 1 — Core port (~1 week)

Goal: `npx fluct-mcp` works end-to-end with stdio MCP and a local PGlite database, no Supabase, no Vercel.

- [ ] Extract `@fluct/core`: schema, MCP tool implementations, bootstrap/sync prompts
- [ ] Wire Drizzle → PGlite (`@electric-sql/pglite` + `drizzle-orm/pglite`)
- [ ] Add `FLUCT_MODE=oss` branch in auth layer — skip Supabase Auth, single-user trust model
- [ ] Stub out org / OAuth / projects / share-link / MCP-lock code paths for OSS mode
- [ ] `bin/fluct-mcp.ts` stdio entry point (MCP server only, no UI)
- [ ] Migration runner for PGlite
- [ ] Minimal `.env.example` (effectively empty)
- [ ] README quick-start finalized

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
