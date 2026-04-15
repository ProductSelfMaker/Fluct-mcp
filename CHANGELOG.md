# Changelog

All notable changes to Fluct-mcp. Format: [Keep a Changelog](https://keepachangelog.com/), semver.

## [0.1.0] — 2026-04-15

Initial public release. Self-hosted AI-native service map for coding agents.

### MCP server (stdio)

- **28 tools** across six domains:
  - **Nodes** — `get_service_map`, `get_node`, `create_product`, `create_page`, `create_feature`, `update_node` (with structural reparenting via `productNodeId` / `parentPageId` / `pageNodeId` / `parentFunctionId`), `delete_node`, `search_nodes`
  - **Dependencies** — `add_dependency` (idempotent across four edge kinds), `remove_dependency`
  - **AI context** — `update_ai_context` with partial-merge writes for `sourceFiles`, `testFiles`, `stateTouches`, `runtimeContext`, `ioContract`
  - **Impact** — `analyze_impact` with changeKind-specific risk bullets (delete / rename / reparent / rescope)
  - **Scenarios** — `get_scenarios`, `get_scenario_steps`, `create_scenario` (trigger + anchor per step, returns step IDs), `update_scenario_step`, `remove_scenario_step`, `delete_scenario`, `toggle_step_anchor`, `get_anchors`, `get_scenario_connections`, `create_scenario_connection` (BFS cycle detection), `create_scenario_from_anchor` (one-shot branching), `delete_scenario_connection`
  - **Snapshots + comments** — `list_snapshots`, `create_snapshot`, `list_comments`, `add_comment`
- **2 prompts** — `bootstrap_from_repo` and `sync_from_repo`, vendor-neutral and compatible with local filesystem access or GitHub API via WebFetch. Both teach agents to populate / refresh AI context fields.
- PGlite (WASM Postgres) ships with the package. Zero external DB setup.
- Single-user auth model — `FLUCT_MAP_ID` / `FLUCT_DB_PATH` env overrides.

### Web UI (Next.js)

- `npm run dev` → `localhost:3000`. Auto-creates default map on first visit.
- React Flow canvas with color-coded products / pages / features and dependency edges.
- Side panel on node click: description, policy, endpoint, status, and the full **AI context** tab (read-only).
- No login, no homepage, no org UI — single local user.
- Writes via MCP; the UI is for verification.

### Known limits (will land in 0.2.0)

- UI is read-only; inline editing of description / policy lands next.
- No scenario editor or playback in the UI yet (MCP tools work fine).
- Map snapshots are created/listed via MCP but not yet browseable in the UI.
- No Docker image. `npm install && npm run dev` is the current install path.
