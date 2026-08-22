import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeatherPage } from './WeatherPage'
import { db } from '@/database/db'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWeatherStore } from '../state/weatherStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { WeatherForecast } from '@/types'

const fetchForecast = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchForecast: (...args: unknown[]) => fetchForecast(...args) },
}))

let mockGpsReading: GeolocationReading = {
  status: 'unavailable',
  reason: 'Geolocation is not supported by this browser.',
}
vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => mockGpsReading,
}))

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
  hourly: [
    {
      time: '2026-08-17T10:00',
      temperatureCelsius: 18,
      relativeHumidityPercent: 60,
      surfacePressureHpa: 1013,
      precipitationMm: 0,
      cloudCoverPercent: 40,
      windSpeedKmh: 12,
      windGustsKmh: 20,
      visibilityMeters: 24000,
    },
    {
      time: '2026-08-17T11:00',
      temperatureCelsius: 19,
      relativeHumidityPercent: 58,
      surfacePressureHpa: 1012,
      precipitationMm: 0.4,
      cloudCoverPercent: 55,
      windSpeedKmh: 14,
      windGustsKmh: 24,
      visibilityMeters: 22000,
    },
  ],
}

afterEach(async () => {
  vi.clearAllMocks()
  mockGpsReading = { status: 'unavailable', reason: 'Geolocation is not supported by this browser.' }
  await db.settings.clear()
  useMapStore.setState({
    view: { center: { lat: 46.8139, lng: -71.208 }, zoom: 12, pitch: 0, bearing: 0 },
  })
  useWeatherStore.setState({
    status: 'idle',
    forecast: null,
    coordinate: null,
    fetchedAt: null,
    isCached: false,
    errorReason: null,
  })
})

describe('WeatherPage', () => {
  it('fetches on mount and shows current conditions plus the hourly forecast', async () => {
    fetchForecast.mockResolvedValue(FORECAST)
    render(<WeatherPage />)

    expect(await screen.findByText('Current conditions')).toBeInTheDocument()
    expect(screen.getByText('18°C')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Next 24 hours')).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('11:00')).toBeInTheDocument()
    expect(screen.getByText('Advanced chart')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Hourly temperature and wind chart' })).toBeInTheDocument()
  })

  it('fetches using the map center and flags it, when GPS is unavailable', async () => {
    fetchForecast.mockResolvedValue(FORECAST)
    render(<WeatherPage />)

    expect(await screen.findByText('Using map location — GPS unavailable')).toBeInTheDocument()
    expect(fetchForecast).toHaveBeenCalledWith({ lat: 46.8139, lng: -71.208 })
  })

  it('fetches using the real GPS position, and does not show the fallback badge, when GPS is available', async () => {
    mockGpsReading = {
      status: 'available',
      value: { lat: 47.1, lng: -70.5, accuracyMeters: 5 },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    fetchForecast.mockResolvedValue(FORECAST)
    render(<WeatherPage />)

    await screen.findByText('Current conditions')
    expect(screen.queryByText('Using map location — GPS unavailable')).not.toBeInTheDocument()
    expect(fetchForecast).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 47.1, lng: -70.5 }),
    )
  })

  it('the refresh button re-fetches with the current coordinate', async () => {
    fetchForecast.mockResolvedValue(FORECAST)
    const user = userEvent.setup()
    render(<WeatherPage />)
    await screen.findByText('Current conditions')
    fetchForecast.mockClear()

    await user.click(screen.getByRole('button', { name: 'Refresh weather' }))

    expect(fetchForecast).toHaveBeenCalledOnce()
  })

  it('shows a real error state when the fetch fails and there is no cache', async () => {
    fetchForecast.mockRejectedValue(new Error('network down'))
    render(<WeatherPage />)

    expect(await screen.findByText('Weather unavailable')).toBeInTheDocument()
    expect(screen.getByText('network down')).toBeInTheDocument()
  })
})
