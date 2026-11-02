import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import { weatherProvider } from '@/services/weather'
import type { Coordinate, PointForecast, WeatherForecast } from '@/types'
import type { LivePoint } from '../forecast/forecastSource'

const CACHE_KEY = 'lastWeatherForecast'
const POINT_CACHE_KEY = 'lastPointForecast'
/** Days asked for the Météo page's forecast (the provider documents 1–16). */
export const PAGE_FORECAST_DAYS = 7

interface CachedWeather {
  coordinate: Coordinate
  forecast: WeatherForecast
  fetchedAt: string // ISO 8601
}

interface CachedPoint {
  coordinate: Coordinate
  point: PointForecast
  fetchedAt: string // ISO 8601
}

export type WeatherStatus = 'idle' | 'loading' | 'available' | 'error'

interface WeatherState {
  status: WeatherStatus
  forecast: WeatherForecast | null
  coordinate: Coordinate | null
  fetchedAt: string | null
  /** `true` when what's showing is a cached fallback (fetch failed —
   * offline, provider down) rather than a fresh reading — always shown
   * to the user, never silently passed off as current. */
  isCached: boolean
  errorReason: string | null

  /** Richer forecast of the Météo page (daily + hourly, 7 days). The same
   * provider as `forecast`; kept separately so the dashboard card is untouched.
   * `pointOrigin` says whether it is fresh or the last copy kept on the device. */
  pointStatus: WeatherStatus
  point: LivePoint | null
  pointError: string | null
  fetchPoint: (coordinate: Coordinate) => Promise<void>
  /** Loads the last point forecast kept on the device, with no network. */
  loadCachedPoint: () => Promise<void>

  /** Fetches a fresh forecast for `coordinate`. On failure, falls back to
   * the last successfully cached forecast (any coordinate) if one
   * exists, clearly flagged via `isCached`; only goes to `error` status
   * if there's truly nothing to show. */
  fetch: (coordinate: Coordinate) => Promise<void>
  /** Shows the last forecast saved on this device WITHOUT any network
   * request (flagged `isCached`). Does nothing if a forecast is already
   * loaded or nothing was ever saved. */
  loadCached: () => Promise<void>
}

export const useWeatherStore = create<WeatherState>((set, get) => ({
  status: 'idle',
  forecast: null,
  coordinate: null,
  fetchedAt: null,
  isCached: false,
  errorReason: null,
  pointStatus: 'idle',
  point: null,
  pointError: null,

  loadCachedPoint: async () => {
    if (get().point) return
    try {
      const cached = await getSetting<CachedPoint | null>(POINT_CACHE_KEY, null)
      if (!cached || get().point) return
      set({
        point: {
          point: cached.point,
          coordinate: cached.coordinate,
          fetchedAt: cached.fetchedAt,
          origin: 'cached',
        },
      })
    } catch {
      // Unreadable cache: nothing shown, never guessed.
    }
  },

  fetchPoint: async (coordinate) => {
    set({ pointStatus: 'loading' })
    try {
      const point = await weatherProvider.fetchPointForecast(
        coordinate,
        PAGE_FORECAST_DAYS,
      )
      const fetchedAt = new Date().toISOString()
      set({
        pointStatus: 'available',
        pointError: null,
        point: { point, coordinate, fetchedAt, origin: 'live' },
      })
      try {
        await setSetting<CachedPoint>(POINT_CACHE_KEY, { coordinate, point, fetchedAt })
      } catch {
        // Best effort: the fresh forecast is shown even if it cannot be kept.
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Erreur inconnue'
      const previous = get().point
      if (previous) {
        // Keep what is shown, flagged as an older copy (never as fresh).
        set({
          pointStatus: 'error',
          pointError: reason,
          point: { ...previous, origin: 'cached' },
        })
        return
      }
      await get().loadCachedPoint()
      set({ pointStatus: 'error', pointError: reason })
    }
  },

  loadCached: async () => {
    if (get().forecast) return
    try {
      const cached = await getSetting<CachedWeather | null>(CACHE_KEY, null)
      if (!cached || get().forecast) return
      set({
        status: 'available',
        forecast: cached.forecast,
        coordinate: cached.coordinate,
        fetchedAt: cached.fetchedAt,
        isCached: true,
        errorReason: null,
      })
    } catch {
      // Unreadable cache: stay « idle » (shown as unavailable), never guess.
    }
  },

  fetch: async (coordinate) => {
    set({ status: 'loading' })
    try {
      const forecast = await weatherProvider.fetchForecast(coordinate)
      const fetchedAt = new Date().toISOString()
      set({
        status: 'available',
        forecast,
        coordinate,
        fetchedAt,
        isCached: false,
        errorReason: null,
      })
      await setSetting<CachedWeather>(CACHE_KEY, { coordinate, forecast, fetchedAt })
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Erreur inconnue'
      const cached = await getSetting<CachedWeather | null>(CACHE_KEY, null)
      if (cached) {
        set({
          status: 'available',
          forecast: cached.forecast,
          coordinate: cached.coordinate,
          fetchedAt: cached.fetchedAt,
          isCached: true,
          errorReason: reason,
        })
      } else {
        set({ status: 'error', errorReason: reason })
      }
    }
  },
}))
