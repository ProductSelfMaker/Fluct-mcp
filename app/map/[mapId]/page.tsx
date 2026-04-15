import { notFound } from 'next/navigation'
import { loadMap } from '../../actions/map.ts'
import { MapEditor } from './editor-client.tsx'

// Phase 2a: read-mostly editor. Loads the map server-side, hands off to
// a React Flow client component for visualization. All writes happen
// via MCP (the user's agent), not via UI buttons yet.

interface Props {
  params: Promise<{ mapId: string }>
}

export default async function MapPage({ params }: Props) {
  const { mapId } = await params
  const data = await loadMap(mapId)
  if (!data) notFound()

  return <MapEditor mapId={mapId} initial={data} />
}
