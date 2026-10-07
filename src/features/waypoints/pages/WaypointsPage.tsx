import { useEffect, useMemo, useState } from 'react'
import { Camera, FolderTree, MapPinned, Route } from 'lucide-react'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { TerritoryFilterBar } from '@/features/territories/components/TerritoryFilterBar'
import { TerritoryManager } from '@/features/territories/components/TerritoryManager'
import { filterItems, hiddenByFilterMessage } from '@/features/territories/filter'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { CATEGORY_ICON, CATEGORY_LABEL, DEFAULT_WAYPOINT_COLOR } from '../categories'
import { WaypointEditPanel } from '../components/WaypointEditPanel'
import { WindComparisonPanel } from '../components/WindComparisonPanel'
import { TrackList } from '../components/TrackList'
import { useTracksStore } from '../state/tracksStore'
import { useWaypointsStore } from '../state/waypointsStore'

function formatCoordinate(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
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

  const territories = useTerritoriesStore((state) => state.territories)
  const territoryFilter = useTerritoriesStore((state) => state.filter)
  const [managing, setManaging] = useState(false)
  const visibleWaypoints = useMemo(
    () => filterItems(waypoints, territoryFilter, territories),
    [waypoints, territoryFilter, territories],
  )
  const visibleTrackCount = useMemo(
    () => filterItems(tracks, territoryFilter, territories).length,
    [tracks, territoryFilter, territories],
  )
  const hiddenWaypoints = waypoints.length - visibleWaypoints.length
  const territoryName = (id: string | undefined) =>
    id ? territories.find((t) => t.id === id)?.name : undefined

  useEffect(() => {
    if (!waypointsLoaded) void loadWaypoints()
    if (!tracksLoaded) void loadTracks()
    // Only re-run if a *different* page instance mounts fresh with stale
    // `loaded` flags — not on every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Points de repère et traces"
        description="Tous les repères enregistrés et toutes les traces GPS. Créez-en de nouveaux depuis la page Carte."
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <TerritoryFilterBar className="min-w-0 flex-1" />
          <button
            type="button"
            onClick={() => setManaging((open) => !open)}
            aria-expanded={managing}
            className="border-surface-600 text-ink-100 hover:bg-surface-800 flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm"
          >
            <FolderTree size={16} aria-hidden="true" />
            Gérer les territoires
          </button>
        </div>
        {managing && <TerritoryManager />}
      </div>

      <WindComparisonPanel />

      <div>
        <h2 className="text-ink-300 mb-3 flex items-center gap-2 text-sm font-semibold">
          <MapPinned size={16} aria-hidden="true" />
          Points de repère ({visibleWaypoints.length})
        </h2>
        {hiddenWaypoints > 0 && (
          <p className="text-ink-500 mb-2 text-xs">
            {hiddenByFilterMessage(hiddenWaypoints)}
          </p>
        )}
        {waypoints.length === 0 ? (
          <EmptyState
            icon={<MapPinned size={28} aria-hidden="true" />}
            title="Aucun point de repère pour le moment"
            description="Ouvrez la page Carte, touchez le bouton +, puis touchez la carte pour en placer un."
          />
        ) : visibleWaypoints.length === 0 ? (
          <EmptyState
            icon={<MapPinned size={28} aria-hidden="true" />}
            title="Aucun point de repère dans ce territoire"
            description="Changez le filtre « Territoire » pour voir les autres points."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visibleWaypoints.map((waypoint) => {
              const Icon = CATEGORY_ICON[waypoint.category] ?? CATEGORY_ICON.general
              const color = waypoint.color ?? DEFAULT_WAYPOINT_COLOR
              const photoCount = waypoint.photoIds?.length ?? 0
              return (
                <Card key={waypoint.id} className="p-0">
                  <button
                    type="button"
                    onClick={() => selectWaypoint(waypoint.id)}
                    className="hover:bg-surface-800 flex w-full items-center gap-3 rounded-[inherit] p-3 text-left transition-colors pointer-coarse:min-h-11"
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
                        {territoryName(waypoint.territoryId) && (
                          <>{territoryName(waypoint.territoryId)} · </>
                        )}
                        {formatCoordinate(
                          waypoint.coordinate.lat,
                          waypoint.coordinate.lng,
                        )}
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
          Traces ({visibleTrackCount})
        </h2>
        <TrackList />
      </div>

      <WaypointEditPanel />
    </div>
  )
}
