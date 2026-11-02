import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import { listSavedForecasts } from '@/database/savedForecastsRepository'
import { windProvider } from '@/services/wind'
import { boundsCover } from '@/features/wind/analysis/windTimeline'
import { findSavedWind } from '@/features/weather/offline/savedForecastLogic'
import { hourIndexAt, windAt as windAtSample } from '@/utils/windField'
import type { LngLatBounds } from '@/utils/tiles'
import type { Coordinate, WeatherMapLayer, WindField, WindHourlyReading } from '@/types'

export type WindLayerStatus = 'idle' | 'loading' | 'available' | 'error'

/** grid resolution — 5x5 = 25 real sampled points per fetch, one batched
 * request (see `OpenMeteoWindProvider`). Enough spatial detail to see
 * genuine variation across a typical hunting-area viewport without
 * pushing toward the free-tier's per-minute call budget on frequent
 * re-fetches. */
const GRID_SIZE = 5

/** Settings key of the last successfully fetched field, so the forecast can
 * still be consulted (flagged as a copy, with its fetch time) when the
 * network is gone. */
const CACHE_KEY = 'lastWindField'
/** A copy is only accepted for the area it was fetched for (± this margin,
 * in degrees) — never applied to a place it does not describe. */
const CACHE_MARGIN_DEGREES = 0.05

/** What the analysis may say about a field that comes from « Télécharger pour
 * ma sortie »: where it was made for, when, and how far it goes. */
export interface WindDownloadInfo {
  id: string
  placeName: string
  /** Reference place of the download (the grid is centred on it). */
  placeCoordinate: Coordinate
  fetchedAt: string
  /** Local `YYYY-MM-DDTHH:mm` of the last hour covered. */
  validTo: string | null
  complete: boolean
}

/** Why no downloaded forecast could be offered after a failed request:
 * `none` = nothing saved for this place, `ended` = saved for this place but
 * its period is over. Never a silent substitution. */
export type SavedWindMiss = 'none' | 'ended'

interface CachedWindField {
  field: WindField
  fetchedAt: string
  bounds: LngLatBounds
}

/** Monotonic request number + controller: only the newest fetch may write
 * its result; an older answer arriving late is dropped (and the older
 * request aborted when possible). */
let latestRequest = 0
let latestController: AbortController | null = null

/** True when the OS asks for reduced motion — the wind particle animation
 * then starts paused (a still frame) and the user must press Lecture. */
function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

interface WindState {
  status: WindLayerStatus
  field: WindField | null
  /** ISO time the current `field` was fetched; `null` before any fetch.
   * Lets other features (e.g. the cache comparator) judge its age before
   * reusing it instead of asking the provider again. */
  fetchedAt: string | null
  errorReason: string | null
  /** `true` when `field` is the saved copy of an earlier fetch (the network
   * request failed) rather than a fresh answer. `fetchedAt` is then the date
   * the copy was fetched. */
  fromCache: boolean
  /** Set when `field` is a forecast the user downloaded for an outing (also
   * `fromCache`): the panel then names the place, date and coverage. */
  download: WindDownloadInfo | null
  /** After a failed request with nothing usable saved: why. */
  savedMiss: SavedWindMiss | null
  /** Whether the flow-field layer is toggled on — kept separate from
   * `status` so turning it off doesn't discard the fetched field (no
   * need to re-fetch on toggling back on). */
  enabled: boolean
  /** Hourly index the timeline scrubber is on, 0 = local midnight today, up
   * to the last hour the loaded field really contains (119 for the 5 days
   * requested here; `weatherStore`'s own forecast still covers 48 h).
   * Doubles as this app's shared timeline
   * cursor (Phase 10): `features/charts/components/AdvancedChart.tsx`,
   * `WeatherPage.tsx`, and `DayTimelineBar.tsx` all read/write this same
   * value rather than each owning a separate one, so dragging any one of
   * them moves all the others — reusing this store directly (an
   * established pattern in this app, see `WindComparisonPanel.tsx`)
   * rather than introducing a parallel "timeline" store that would just
   * have to stay in sync with this one. */
  selectedHourOffset: number
  /** Which Windy-style layer the map canvas renders — switching this
   * never re-fetches: temperature/precipitation/cloud cover already ride
   * along on the same batched grid request as wind (see
   * `OpenMeteoWindProvider`), so every layer is instantly available once
   * one fetch has landed. */
  activeLayer: WeatherMapLayer
  /** Wind particle animation paused (still frame). Defaults to `true`
   * when the OS requests reduced motion. */
  animationPaused: boolean

  toggle: (bounds: LngLatBounds) => void
  fetch: (bounds: LngLatBounds) => Promise<void>
  setSelectedHourOffset: (offset: number) => void
  setActiveLayer: (layer: WeatherMapLayer) => void
  setAnimationPaused: (paused: boolean) => void
  /** Real wind reading nearest `coordinate` at the currently scrubbed
   * hour — `null` if no field is loaded, never a guess. */
  windAt: (coordinate: Coordinate) => WindHourlyReading | null
}

export const useWindStore = create<WindState>((set, get) => ({
  status: 'idle',
  field: null,
  fetchedAt: null,
  errorReason: null,
  fromCache: false,
  download: null,
  savedMiss: null,
  enabled: false,
  selectedHourOffset: 0,
  activeLayer: 'wind',
  animationPaused: prefersReducedMotion(),

  toggle: (bounds) => {
    const { enabled, field } = get()
    if (enabled) {
      set({ enabled: false })
      return
    }
    set({ enabled: true })
    if (!field) void get().fetch(bounds)
  },

  fetch: async (bounds) => {
    latestController?.abort()
    const controller = new AbortController()
    latestController = controller
    const request = ++latestRequest
    set({ status: 'loading' })
    try {
      const field = await windProvider.fetchWindField(
        bounds,
        GRID_SIZE,
        controller.signal,
      )
      if (request !== latestRequest) return
      const fetchedAt = new Date().toISOString()
      set({
        status: 'available',
        field,
        fetchedAt,
        errorReason: null,
        fromCache: false,
        download: null,
        savedMiss: null,
      })
      try {
        await setSetting<CachedWindField>(CACHE_KEY, { field, fetchedAt, bounds })
      } catch {
        // Best effort: no saved copy, the live field still works.
      }
    } catch (err) {
      if (request !== latestRequest) return
      const reason = err instanceof Error ? err.message : 'Erreur inconnue'
      // The fetch failed: keep whatever field is already shown (flagged by
      // the error status), else offer the saved copy for this very area.
      if (get().field) {
        set({ status: 'error', errorReason: reason })
        return
      }
      const [cached, saved] = await Promise.all([
        getSetting<CachedWindField | null>(CACHE_KEY, null).catch(() => null),
        listSavedForecasts().catch(() => []),
      ])
      if (request !== latestRequest) return
      const center = {
        lat: (bounds.north + bounds.south) / 2,
        lng: (bounds.east + bounds.west) / 2,
      }
      const lookup = findSavedWind(saved, center, new Date())
      const liveCopy =
        cached && boundsCover(cached.bounds, center, CACHE_MARGIN_DEGREES) ? cached : null
      // A download made for this place whose period covers now, unless the
      // last live copy of the area is more recent. Never another place, never
      // an ended period.
      if (
        lookup.kind === 'found' &&
        lookup.saved.windField !== null &&
        (!liveCopy || lookup.saved.fetchedAt >= liveCopy.fetchedAt)
      ) {
        const s = lookup.saved
        const savedField = lookup.saved.windField
        const index = savedField ? hourIndexAt(savedField, new Date()) : null
        set({
          status: 'available',
          field: s.windField,
          fetchedAt: s.fetchedAt,
          errorReason: reason,
          fromCache: true,
          download: {
            id: s.id,
            placeName: s.place.name,
            placeCoordinate: s.place.coordinate,
            fetchedAt: s.fetchedAt,
            validTo: s.validTo,
            complete: s.status === 'complete',
          },
          savedMiss: null,
          ...(index !== null ? { selectedHourOffset: index } : null),
        })
      } else if (liveCopy) {
        set({
          status: 'available',
          field: liveCopy.field,
          fetchedAt: liveCopy.fetchedAt,
          errorReason: reason,
          fromCache: true,
          download: null,
          savedMiss: null,
        })
      } else {
        set({
          status: 'error',
          errorReason: reason,
          download: null,
          savedMiss: lookup.kind === 'ended' ? 'ended' : 'none',
        })
      }
    }
  },

  setSelectedHourOffset: (offset) => {
    // Clamped to what the loaded field covers (a 48 h copy cached before the
    // 5-day horizon keeps working); 47 is the floor with no field yet.
    const length = get().field?.samples[0]?.hourly.length ?? 0
    const last = Math.max(47, length - 1)
    set({ selectedHourOffset: Math.max(0, Math.min(last, Math.round(offset))) })
  },

  setActiveLayer: (layer) => set({ activeLayer: layer }),

  setAnimationPaused: (paused) => set({ animationPaused: paused }),

  windAt: (coordinate) => {
    const { field, selectedHourOffset } = get()
    if (!field) return null
    return windAtSample(field, coordinate, selectedHourOffset)
  },
}))
