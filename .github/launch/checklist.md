# v0.1.0 launch checklist

## Repo admin

- [ ] GitHub About → description: `AI-native service map for coding agents. Standard MCP, runs locally. The open core of Fluct.`
- [ ] GitHub About → website: `https://fluct.tools`
- [ ] GitHub Topics: `mcp`, `model-context-protocol`, `ai-coding`, `claude-code`, `cursor`, `cline`, `service-map`, `codebase-intelligence`, `developer-tools`, `nextjs`, `drizzle`, `typescript`, `agent`
- [ ] Enable Issues + Discussions
- [ ] Pin `CONTRIBUTING.md` and `ROADMAP.md` to homepage via README links (already done)

## npm release

1. Log in: `npm login`
2. Sanity build: `npm run mcp:build && npm pack --dry-run`
3. Publish: `npm publish --access public`
4. Verify: `npx -y fluct-mcp` from a fresh shell invokes the server

## GitHub release

1. `git tag -a v0.1.0 -m "v0.1.0 — initial public release"`
2. `git push origin v0.1.0`
3. Create release on GitHub — paste `CHANGELOG.md` entry as body
4. Attach `fluct-mcp-0.1.0.tgz` as binary asset (optional but nice)

## Demo assets (record before launch)

- 30–60s terminal GIF:
  - `npx -y fluct-mcp` starts, Claude Desktop sees tools
  - User asks "refactor the auth flow"
  - Agent calls `analyze_impact` → shows the blast-radius report in terminal
  - User approves → agent calls `update_node` + `update_ai_context`
- Second GIF (optional): `npm run dev` → browse the map at `localhost:3000`, click a node, show the AI-context panel populating

## Launch posts

- [ ] Show HN — see `hn-post.md`, submit around 08:00 PT
- [ ] X/Twitter thread — 3 tweets, repo link in first
- [ ] r/LocalLLaMA — self-post
- [ ] Post in MCP-related Discords (Anthropic community, Cursor, Cline)

## Day-of monitoring

- [ ] Watch GitHub issues; respond within a few hours for first 48h
- [ ] Watch HN comments; engage with every substantive question
- [ ] Note install failures → file issues → hotfix 0.1.1 if needed
