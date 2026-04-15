import { redirect } from 'next/navigation'
import { ensureDefaultMap } from './actions/map.ts'

// The DB doesn't exist at build time, so this must stay dynamic.
// Next.js would otherwise try to prerender `/` and hit PGlite with
// an empty on-disk file.
export const dynamic = 'force-dynamic'

// Root route: Fluct-mcp is single-user, so there's no dashboard —
// just jump straight to the most recently updated map, or create the
// default map on first ever run and land there.
export default async function RootPage() {
  const mapId = await ensureDefaultMap()
  redirect(`/map/${mapId}`)
}
