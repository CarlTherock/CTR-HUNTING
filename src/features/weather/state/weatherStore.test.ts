import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useWeatherStore } from './weatherStore'
import type { WeatherForecast } from '@/types'

const fetchForecast = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchForecast: (...args: unknown[]) => fetchForecast(...args) },
}))

const COORDINATE = { lat: 46.8, lng: -71.2 }

const FORECAST: WeatherForecast = {
  timezone: 'America/Toronto',
  current: {
    timestamp: '2026-08-17T10:00',
    temperatureCelsius: 18,
    relativeHumidityPercent: 60,
    surfacePressureHpa: 1013,
    precipitationMm: 0,
    cloudCoverPercent: 40,
    windSpeedKmh: 12,
    windGustsKmh: 20,
    visibilityMeters: 24000,
  },
  hourly: [],
}

afterEach(async () => {
  vi.clearAllMocks()
  await db.settings.clear()
  useWeatherStore.setState({
    status: 'idle',
    forecast: null,
    coordinate: null,
    fetchedAt: null,
    isCached: false,
    errorReason: null,
  })
})

describe('weatherStore', () => {
  it('fetches and stores a fresh forecast', async () => {
    fetchForecast.mockResolvedValue(FORECAST)

    await useWeatherStore.getState().fetch(COORDINATE)

    const state = useWeatherStore.getState()
    expect(state.status).toBe('available')
    expect(state.forecast).toEqual(FORECAST)
    expect(state.isCached).toBe(false)
    expect(fetchForecast).toHaveBeenCalledWith(COORDINATE)
  })

  it('persists a successful fetch so it can be used as a fallback later', async () => {
    fetchForecast.mockResolvedValue(FORECAST)

    await useWeatherStore.getState().fetch(COORDINATE)

    const cached = await db.settings.get('lastWeatherForecast')
    expect(cached?.value).toMatchObject({ coordinate: COORDINATE, forecast: FORECAST })
  })

  it('falls back to the cached forecast (clearly flagged) when a fetch fails', async () => {
    fetchForecast.mockResolvedValueOnce(FORECAST)
    await useWeatherStore.getState().fetch(COORDINATE)

    fetchForecast.mockRejectedValueOnce(new Error('network down'))
    await useWeatherStore.getState().fetch({ lat: 47, lng: -72 })

    const state = useWeatherStore.getState()
    expect(state.status).toBe('available')
    expect(state.isCached).toBe(true)
    expect(state.forecast).toEqual(FORECAST)
    expect(state.errorReason).toBe('network down')
  })

  it('reports a real error state when a fetch fails and there is no cache to fall back on', async () => {
    fetchForecast.mockRejectedValue(new Error('network down'))

    await useWeatherStore.getState().fetch(COORDINATE)

    const state = useWeatherStore.getState()
    expect(state.status).toBe('error')
    expect(state.forecast).toBeNull()
    expect(state.errorReason).toBe('network down')
  })

  describe('loadCached', () => {
    it('shows the saved forecast, flagged as cached, without any network request', async () => {
      await db.settings.put({
        key: 'lastWeatherForecast',
        value: {
          coordinate: COORDINATE,
          forecast: FORECAST,
          fetchedAt: '2026-08-17T09:00:00Z',
        },
      })

      await useWeatherStore.getState().loadCached()

      const state = useWeatherStore.getState()
      expect(state.status).toBe('available')
      expect(state.isCached).toBe(true)
      expect(state.forecast).toEqual(FORECAST)
      expect(state.fetchedAt).toBe('2026-08-17T09:00:00Z')
      expect(fetchForecast).not.toHaveBeenCalled()
    })

    it('stays idle (nothing invented) when nothing was ever saved', async () => {
      await useWeatherStore.getState().loadCached()

      expect(useWeatherStore.getState().status).toBe('idle')
      expect(useWeatherStore.getState().forecast).toBeNull()
    })

    it('does not overwrite a forecast that is already loaded', async () => {
      fetchForecast.mockResolvedValueOnce(FORECAST)
      await useWeatherStore.getState().fetch(COORDINATE)
      await db.settings.put({
        key: 'lastWeatherForecast',
        value: {
          coordinate: { lat: 1, lng: 1 },
          forecast: { ...FORECAST, timezone: 'Other/Zone' },
          fetchedAt: '2020-01-01T00:00:00Z',
        },
      })

      await useWeatherStore.getState().loadCached()

      expect(useWeatherStore.getState().isCached).toBe(false)
      expect(useWeatherStore.getState().forecast?.timezone).toBe('America/Toronto')
    })
  })
})
