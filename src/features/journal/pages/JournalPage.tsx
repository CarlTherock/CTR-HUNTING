import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, NotebookPen, Trash2 } from 'lucide-react'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWeatherStore } from '@/features/weather/state/weatherStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { windAt } from '@/utils/windField'
import { compassLabel } from '@/utils/terrain'
import { useJournalStore } from '../state/journalStore'
import { JournalPhotos } from '../components/JournalPhotos'
import type { Observation } from '@/types'

function formatCoordinate(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/** A real conditions snapshot from whatever weather/wind data the app
 * already has loaded (Phases 5/6) — only built when there's a genuine
 * reading for every field; otherwise `undefined`, never a partially
 * fabricated snapshot. */
function snapshotConditions(coordinate: { lat: number; lng: number }): Observation['conditions'] {
  const forecast = useWeatherStore.getState().forecast
  const windField = useWindStore.getState().field
  if (!forecast || !windField) return undefined
  const reading = windAt(windField, coordinate, 0)
  if (!reading) return undefined
  return {
    temperatureCelsius: forecast.current.temperatureCelsius,
    windSpeedKmh: reading.speedKmh,
    windDirectionDegrees: reading.directionDegrees,
    cloudCoverPercent: forecast.current.cloudCoverPercent,
  }
}

/**
 * Phase 13 — field journal. `Observation` (`types/observation.ts`) was
 * already scaffolded back in Phase 0 (a table existed, unused, since
 * observations are referenced from waypoints/photos) — this phase
 * builds the real UI on top of it, plus a `conditions` snapshot field.
 * "Viewable on the map": each entry's "View on map" button recenters the
 * Map page on its real coordinate (no separate marker layer — reuses
 * the same `mapStore.setView` the GPS recenter button already drives).
 */
export function JournalPage() {
  const observations = useJournalStore((state) => state.observations)
  const loaded = useJournalStore((state) => state.loaded)
  const load = useJournalStore((state) => state.load)
  const editingId = useJournalStore((state) => state.editingId)
  const create = useJournalStore((state) => state.create)
  const update = useJournalStore((state) => state.update)
  const remove = useJournalStore((state) => state.remove)
  const select = useJournalStore((state) => state.select)

  const gpsReading = useGeolocation()
  const mapCenter = useMapStore((state) => state.view.center)
  const setMapView = useMapStore((state) => state.setView)
  const navigate = useNavigate()

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const usingGps = gpsReading.status === 'available'
  const coordinate = usingGps ? gpsReading.value : mapCenter

  async function handleNewEntry() {
    await create({ coordinate, notes: '', conditions: snapshotConditions(coordinate) })
  }

  function viewOnMap(observation: Observation) {
    setMapView({ center: observation.coordinate })
    navigate('/map')
  }

  const sorted = [...observations].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
  const editing = observations.find((o) => o.id === editingId)

  // Local draft state for notes — `update()` is async (persists to Dexie
  // before the store reflects it), so binding the textarea's `value`
  // directly to store state would race: a fast keystroke's `onChange`
  // could fire while the previous keystroke's `update()` hadn't resolved
  // yet, and the textarea would visibly snap back to the stale
  // store value, corrupting what was typed. A local draft, saved on
  // blur, avoids that entirely — same pattern as `WaypointEditPanel`.
  const [notesDraft, setNotesDraft] = useState('')
  const [draftFor, setDraftFor] = useState(editingId)
  if (draftFor !== editingId) {
    setDraftFor(editingId)
    setNotesDraft(editing?.notes ?? '')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Journal"
        description="Field observations — notes, photos, position, and real conditions."
        actions={
          <button
            type="button"
            onClick={() => void handleNewEntry()}
            className="bg-brand-500 rounded-lg px-3 py-1.5 text-sm font-medium text-white"
          >
            New entry
          </button>
        }
      />

      {!usingGps && <Badge variant="warning">Using map location — GPS unavailable</Badge>}

      {editing && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-ink-100 text-sm font-semibold">
              {new Date(editing.timestamp).toLocaleString()}
            </h2>
            <button
              type="button"
              onClick={() => {
                void update(editing.id, { notes: notesDraft })
                select(null)
              }}
              className="text-ink-500 hover:text-ink-100 text-xs"
            >
              Close
            </button>
          </div>
          <p className="text-ink-500 mb-2 text-xs">
            {formatCoordinate(editing.coordinate.lat, editing.coordinate.lng)}
          </p>
          {editing.conditions && (
            <p className="text-ink-500 mb-2 text-xs">
              {Math.round(editing.conditions.temperatureCelsius)}°C ·{' '}
              {Math.round(editing.conditions.windSpeedKmh)} km/h from{' '}
              {compassLabel(editing.conditions.windDirectionDegrees)} ·{' '}
              {Math.round(editing.conditions.cloudCoverPercent)}% cloud
            </p>
          )}
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={() => void update(editing.id, { notes: notesDraft })}
            placeholder="What did you see?"
            rows={3}
            className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 mb-3 w-full resize-none rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:outline-2"
          />
          <JournalPhotos observationId={editing.id} photoIds={editing.photoIds ?? []} />
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void remove(editing.id)}
              className="text-status-danger flex items-center gap-1 text-xs"
            >
              <Trash2 size={13} aria-hidden="true" />
              Delete entry
            </button>
            <button
              type="button"
              onClick={() => viewOnMap(editing)}
              className="text-brand-400 flex items-center gap-1 text-xs"
            >
              <MapPin size={13} aria-hidden="true" />
              View on map
            </button>
          </div>
        </Card>
      )}

      {sorted.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={28} aria-hidden="true" />}
          title="No journal entries yet"
          description="Tap 'New entry' to log an observation at your current position."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((observation) => (
            <Card
              key={observation.id}
              className="hover:bg-surface-800 cursor-pointer p-3 transition-colors"
            >
              <button
                type="button"
                onClick={() => select(observation.id)}
                className="flex w-full flex-col items-start gap-1 text-left"
              >
                <span className="text-ink-100 truncate text-sm font-medium">
                  {observation.notes || 'Untitled entry'}
                </span>
                <span className="text-ink-500 flex items-center gap-2 text-xs">
                  {new Date(observation.timestamp).toLocaleString()} ·{' '}
                  {formatCoordinate(observation.coordinate.lat, observation.coordinate.lng)}
                  {(observation.photoIds?.length ?? 0) > 0 && ` · ${observation.photoIds?.length} photo(s)`}
                </span>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
