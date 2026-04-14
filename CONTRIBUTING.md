# Contributing to Fluct

Thanks for your interest. Phase 0 means code is **not yet in this repo** — the scaffolding lives here, the core port lands in Phase 1 (see [`ROADMAP.md`](./ROADMAP.md)).

## How to help right now

- **File an issue** describing a pain Fluct should solve for you, or a missing tool in the MCP surface.
- **Discuss architecture** in GitHub Discussions — the Phase 1 boundary (`@fluct/core` extraction, PGlite adapter) is still moving.
- **Share your AI client config** — if you use an MCP-compatible agent not on the quick-start list, open an issue so we verify compatibility at Phase 3.

## Code contributions (Phase 1+)

Once Phase 1 lands:

1. Fork + clone
2. `npm install`
3. `npm run dev` for the UI, `npm run mcp:dev` for the stdio server
4. Lint + typecheck before PR: `npm run lint && npm run typecheck`
5. Tests: `npm test`

## Scope

Fluct-mcp focuses on the single-user, self-hosted experience. Multi-user features (organizations, OAuth for cloud agents, share links, project workflows) stay at [fluct.tools](https://fluct.tools) — please direct those requests there.

## Code of conduct

Be direct, be kind. Assume the other person is trying to make Fluct better. Attack the idea, not the person.

## License

By contributing, you agree your contributions will be licensed under the Apache 2.0 license (see [`LICENSE`](./LICENSE)).
