import { PhasePlaceholder } from '@/components/ui'

export function WaypointsPage() {
  return (
    <PhasePlaceholder
      title="Waypoints & Tracks"
      description="Field markers and recorded GPS tracks."
      phase={2}
      phaseName="Waypoints & Tracks"
      upcoming={[
        'Create / edit / move / delete waypoints',
        'Categories & notes',
        'Waypoint photos',
        'GPS track recording',
        'Distance, duration, altitude',
        'Local-first save (works offline)',
      ]}
    />
  )
}
