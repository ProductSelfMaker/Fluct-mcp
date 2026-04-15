import { redirect } from 'next/navigation'
import { ensureDefaultMap } from './actions/map.ts'

// Root route: Fluct-mcp is single-user, so there's no dashboard —
// just jump straight to the most recently updated map, or create the
// default map on first ever run and land there.
export default async function RootPage() {
  const mapId = await ensureDefaultMap()
  redirect(`/map/${mapId}`)
}
