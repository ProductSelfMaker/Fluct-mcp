import type { NextConfig } from 'next'

const config: NextConfig = {
  // PGlite ships WASM and uses `node:*` — tell Next.js to load it
  // server-side only. React Server Components with client fallback.
  serverExternalPackages: ['@electric-sql/pglite'],
  experimental: {
    // Nothing here yet; placeholder for future flags.
  },
}

export default config
