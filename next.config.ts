import type { NextConfig } from 'next'

const config: NextConfig = {
  // Standalone output is what makes `npx -y fluct-mcp ui` work — Next.js
  // bundles a self-contained server at .next/standalone/server.js with
  // traced node_modules, so the shipped npm tarball can run without the
  // user ever calling `npm install`.
  output: 'standalone',
  // PGlite ships WASM and uses `node:*` APIs — it must stay external so
  // Next.js doesn't try to bundle it into client chunks.
  serverExternalPackages: ['@electric-sql/pglite'],
}

export default config
