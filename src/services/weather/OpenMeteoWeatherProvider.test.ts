import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider'

const FAKE_RESPONSE = {
  timezone: 'America/Toronto',
  current: {
    time: '2026-08-17T10:00',
    temperature_2m: 18.4,
    relative_humidity_2m: 62,
    surface_pressure: 1013.2,
    precipitation: 0,
    cloud_cover: 40,
    wind_speed_10m: 12.3,
    wind_gusts_10m: 21.1,
  },
  hourly: {
    time: ['2026-08-17T10:00', '2026-08-17T11:00'],
    temperature_2m: [18.4, 19.1],
    relative_humidity_2m: [62, 58],
    surface_pressure: [1013.2, 1012.9],
    precipitation: [0, 0.2],
    cloud_cover: [40, 55],
    visibility: [24000, 22000],
    wind_speed_10m: [12.3, 13.0],
    wind_gusts_10m: [21.1, 22.5],
  },
}

function stubFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(response),
    }),
  )
}

describe('OpenMeteoWeatherProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the real Open-Meteo endpoint with the coordinate and verified parameter names', async () => {
    stubFetch(FAKE_RESPONSE)
    const provider = new OpenMeteoWeatherProvider()

    await provider.fetchForecast({ lat: 46.8, lng: -71.2 })

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const requested = new URL(String(url))
    expect(requested.origin + requested.pathname).toBe(
      'https://api.open-meteo.com/v1/forecast',
    )
    expect(requested.searchParams.get('latitude')).toBe('46.8')
    expect(requested.searchParams.get('longitude')).toBe('-71.2')
    expect(requested.searchParams.get('current')).toContain('temperature_2m')
    expect(requested.searchParams.get('current')).toContain('wind_gusts_10m')
    expect(requested.searchParams.get('hourly')).toContain('visibility')
    expect(requested.searchParams.get('timezone')).toBe('auto')
  })

  it('maps the current conditions, sourcing visibility from the first hourly sample', async () => {
    stubFetch(FAKE_RESPONSE)
    const provider = new OpenMeteoWeatherProvider()

    const forecast = await provider.fetchForecast({ lat: 46.8, lng: -71.2 })

    expect(forecast.timezone).toBe('America/Toronto')
    expect(forecast.current).toEqual({
      timestamp: '2026-08-17T10:00',
      temperatureCelsius: 18.4,
      relativeHumidityPercent: 62,
      surfacePressureHpa: 1013.2,
      precipitationMm: 0,
      cloudCoverPercent: 40,
      windSpeedKmh: 12.3,
      windGustsKmh: 21.1,
      visibilityMeters: 24000, // from hourly[0], not fabricated
    })
  })

  it('maps every hourly entry, not just the first', async () => {
    stubFetch(FAKE_RESPONSE)
    const provider = new OpenMeteoWeatherProvider()

    const forecast = await provider.fetchForecast({ lat: 46.8, lng: -71.2 })

    expect(forecast.hourly).toHaveLength(2)
    expect(forecast.hourly[1]).toEqual({
      time: '2026-08-17T11:00',
      temperatureCelsius: 19.1,
      relativeHumidityPercent: 58,
      surfacePressureHpa: 1012.9,
      precipitationMm: 0.2,
      cloudCoverPercent: 55,
      windSpeedKmh: 13.0,
      windGustsKmh: 22.5,
      visibilityMeters: 22000,
    })
  })

  it('throws on a non-OK response rather than returning fabricated data', async () => {
    stubFetch(null, false, 503)
    const provider = new OpenMeteoWeatherProvider()

    await expect(provider.fetchForecast({ lat: 46.8, lng: -71.2 })).rejects.toThrow(/503/)
  })
})

describe('OpenMeteoWeatherProvider.fetchPointForecast', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const POINT_RESPONSE = {
    timezone: 'America/Toronto',
    hourly: {
      time: ['2026-11-02T00:00', '2026-11-02T01:00'],
      temperature_2m: [4.1, null],
      apparent_temperature: [1.2, 0.8],
      weather_code: [3, 61],
      precipitation: [0, 0.4],
      precipitation_probability: [10, null],
      relative_humidity_2m: [80, 82],
      surface_pressure: [1010, 1009],
      cloud_cover: [90, 100],
      visibility: [null, null],
      uv_index: [0, 0],
      wind_speed_10m: [14, 16],
      wind_gusts_10m: [28, null],
      wind_direction_10m: [225, null],
      is_day: [0, 0],
    },
    daily: {
      time: ['2026-11-02'],
      weather_code: [61],
      temperature_2m_max: [7],
      temperature_2m_min: [1],
      apparent_temperature_max: [4],
      apparent_temperature_min: [-2],
      sunrise: ['2026-11-02T06:45'],
      sunset: [null],
      precipitation_sum: [2.2],
      uv_index_max: [1],
      wind_speed_10m_max: [25],
      wind_gusts_10m_max: [45],
      wind_direction_10m_dominant: [225],
    },
  }

  it('asks explicit units, the place time zone and a clamped number of days', async () => {
    stubFetch(POINT_RESPONSE)
    await new OpenMeteoWeatherProvider().fetchPointForecast({ lat: 46.8, lng: -71.2 }, 40)
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const q = new URL(String(url)).searchParams
    expect(q.get('forecast_days')).toBe('16')
    expect(q.get('timezone')).toBe('auto')
    expect(q.get('wind_speed_unit')).toBe('kmh')
    expect(q.get('temperature_unit')).toBe('celsius')
    expect(q.get('precipitation_unit')).toBe('mm')
    expect(q.get('hourly')).toContain('wind_direction_10m')
    expect(q.get('daily')).toContain('sunset')
  })

  it('keeps absent values as null, never 0', async () => {
    stubFetch(POINT_RESPONSE)
    const point = await new OpenMeteoWeatherProvider().fetchPointForecast(
      { lat: 46.8, lng: -71.2 },
      2,
    )
    expect(point.timezone).toBe('America/Toronto')
    expect(point.hourly[1].temperatureCelsius).toBeNull()
    expect(point.hourly[1].windDirectionDegrees).toBeNull()
    expect(point.hourly[1].windGustsKmh).toBeNull()
    expect(point.hourly[1].precipitationProbabilityPercent).toBeNull()
    expect(point.hourly[0].visibilityMeters).toBeNull()
    expect(point.hourly[0].windDirectionDegrees).toBe(225)
    expect(point.hourly[0].isDay).toBe(false)
    expect(point.daily[0].sunset).toBeNull()
    expect(point.daily[0].sunrise).toBe('2026-11-02T06:45')
  })

  it('reports an HTTP failure instead of returning empty data', async () => {
    stubFetch({}, false, 503)
    await expect(
      new OpenMeteoWeatherProvider().fetchPointForecast({ lat: 46.8, lng: -71.2 }, 3),
    ).rejects.toThrow()
  })
})
