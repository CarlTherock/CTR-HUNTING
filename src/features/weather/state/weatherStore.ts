import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import { weatherProvider } from '@/services/weather'
import type { Coordinate, WeatherForecast } from '@/types'

const CACHE_KEY = 'lastWeatherForecast'

interface CachedWeather {
  coordinate: Coordinate
  forecast: WeatherForecast
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

  /** Fetches a fresh forecast for `coordinate`. On failure, falls back to
   * the last successfully cached forecast (any coordinate) if one
   * exists, clearly flagged via `isCached`; only goes to `error` status
   * if there's truly nothing to show. */
  fetch: (coordinate: Coordinate) => Promise<void>
}

export const useWeatherStore = create<WeatherState>((set) => ({
  status: 'idle',
  forecast: null,
  coordinate: null,
  fetchedAt: null,
  isCached: false,
  errorReason: null,

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
      const reason = err instanceof Error ? err.message : 'Unknown error'
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
