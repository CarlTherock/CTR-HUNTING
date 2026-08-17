import { useEffect } from 'react'
import { Camera, MapPinned, Route, Trash2 } from 'lucide-react'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { formatDistanceMeters, formatDuration } from '@/utils/format'
import { CATEGORY_ICON, CATEGORY_LABEL, DEFAULT_WAYPOINT_COLOR } from '../categories'
import { WaypointEditPanel } from '../components/WaypointEditPanel'
import { WindComparisonPanel } from '../components/WindComparisonPanel'
import { useTracksStore } from '../state/tracksStore'
import { useWaypointsStore } from '../state/waypointsStore'
import type { Track } from '@/types'

function formatCoordinate(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

function trackDurationMs(track: Track, isRecording: boolean): number {
  const start = new Date(track.startedAt).getTime()
  const end = track.endedAt ? new Date(track.endedAt).getTime() : isRecording ? Date.now() : start
  return end - start
}

/** Phase 2, slice 2.2/2.3: a dedicated list of every saved waypoint and
 * recorded track — creation/editing still happens from the Map page (a
 * waypoint needs a tap-on-map position; a track needs live GPS), so this
 * page is read/edit/delete, not create. Tapping a waypoint row opens the
 * same `WaypointEditPanel` the Map page uses — it's driven entirely by
 * `waypointsStore.editingId`, so it works unchanged from either page. */
export function WaypointsPage() {
  const waypoints = useWaypointsStore((state) => state.waypoints)
  const waypointsLoaded = useWaypointsStore((state) => state.loaded)
  const loadWaypoints = useWaypointsStore((state) => state.load)
  const selectWaypoint = useWaypointsStore((state) => state.selectWaypoint)

  const tracks = useTracksStore((state) => state.tracks)
  const tracksLoaded = useTracksStore((state) => state.loaded)
  const loadTracks = useTracksStore((state) => state.load)
  const recordingId = useTracksStore((state) => state.recordingId)
  const deleteTrack = useTracksStore((state) => state.deleteTrack)

  useEffect(() => {
    if (!waypointsLoaded) void loadWaypoints()
    if (!tracksLoaded) void loadTracks()
    // Only re-run if a *different* page instance mounts fresh with stale
    // `loaded` flags — not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortedTracks = [...tracks].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Waypoints & Tracks"
        description="Every saved marker and recorded GPS track. Create new ones from the Map page."
      />

      <WindComparisonPanel />

      <div>
        <h2 className="text-ink-300 mb-3 flex items-center gap-2 text-sm font-semibold">
          <MapPinned size={16} aria-hidden="true" />
          Waypoints ({waypoints.length})
        </h2>
        {waypoints.length === 0 ? (
          <EmptyState
            icon={<MapPinned size={28} aria-hidden="true" />}
            title="No waypoints yet"
            description="Open the Map page, tap the + button, then tap the map to place one."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {waypoints.map((waypoint) => {
              const Icon = CATEGORY_ICON[waypoint.category] ?? CATEGORY_ICON.general
              const color = waypoint.color ?? DEFAULT_WAYPOINT_COLOR
              const photoCount = waypoint.photoIds?.length ?? 0
              return (
                <Card key={waypoint.id} className="p-0">
                  <button
                    type="button"
                    onClick={() => selectWaypoint(waypoint.id)}
                    className="hover:bg-surface-800 flex w-full items-center gap-3 rounded-[inherit] p-3 text-left transition-colors"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white"
                      style={{ border: `3px solid ${color}` }}
                    >
                      <Icon size={14} color="black" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink-100 block truncate text-sm font-medium">
                        {waypoint.name}
                      </span>
                      <span className="text-ink-500 flex items-center gap-1 truncate text-xs">
                        {CATEGORY_LABEL[waypoint.category]} ·{' '}
                        {formatCoordinate(waypoint.coordinate.lat, waypoint.coordinate.lng)}
                        {photoCount > 0 && (
                          <span className="ml-1 inline-flex items-center gap-0.5">
                            <Camera size={11} aria-hidden="true" />
                            {photoCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-ink-300 mb-3 flex items-center gap-2 text-sm font-semibold">
          <Route size={16} aria-hidden="true" />
          Tracks ({tracks.length})
        </h2>
        {tracks.length === 0 ? (
          <EmptyState
            icon={<Route size={28} aria-hidden="true" />}
            title="No tracks yet"
            description="Open the Map page and tap the record button to start tracking a walk."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {sortedTracks.map((track) => {
              const isRecording = track.id === recordingId
              return (
                <Card key={track.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <span className="text-ink-100 block truncate text-sm font-medium">
                      {track.name}
                      {isRecording && (
                        <span className="text-status-danger ml-2 text-xs font-normal">
                          ● Recording
                        </span>
                      )}
                    </span>
                    <span className="text-ink-500 block truncate text-xs">
                      {formatDistanceMeters(track.distanceMeters ?? 0)} ·{' '}
                      {formatDuration(trackDurationMs(track, isRecording))} ·{' '}
                      {new Date(track.startedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteTrack(track.id)}
                    disabled={isRecording}
                    aria-label={`Delete ${track.name}`}
                    title={isRecording ? 'Stop recording before deleting' : 'Delete track'}
                    className="text-ink-500 hover:text-status-danger shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <WaypointEditPanel />
    </div>
  )
}
