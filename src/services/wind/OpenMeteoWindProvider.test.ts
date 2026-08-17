import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenMeteoWindProvider } from './OpenMeteoWindProvider'

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

const FAKE_LOCATION = {
  timezone: 'America/Toronto',
  hourly: {
    time: ['2026-08-17T10:00', '2026-08-17T11:00'],
    wind_speed_10m: [12.3, 14.0],
    wind_direction_10m: [270, 280],
    wind_gusts_10m: [21.1, 23.5],
  },
}

function stubFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(response) }),
  )
}

describe('OpenMeteoWindProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests a real gridSize×gridSize grid of coordinates covering the bounds, in one batched call', async () => {
    const locations = Array.from({ length: 9 }, () => FAKE_LOCATION)
    stubFetch(locations)
    const provider = new OpenMeteoWindProvider()

    await provider.fetchWindField(BOUNDS, 3)

    expect(fetch).toHaveBeenCalledOnce()
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const requested = new URL(String(url))
    const lats = (requested.searchParams.get('latitude') ?? '').split(',')
    const lngs = (requested.searchParams.get('longitude') ?? '').split(',')
    expect(lats).toHaveLength(9) // 3x3 grid, one request
    expect(lngs).toHaveLength(9)
    // Every grid point must fall within the requested bounds.
    for (const lat of lats.map(Number)) {
      expect(lat).toBeGreaterThan(BOUNDS.south)
      expect(lat).toBeLessThan(BOUNDS.north)
    }
    expect(requested.searchParams.get('hourly')).toContain('wind_direction_10m')
  })

  it('maps each grid point to its own real sample with matching coordinates', async () => {
    const locations = Array.from({ length: 4 }, () => FAKE_LOCATION)
    stubFetch(locations)
    const provider = new OpenMeteoWindProvider()

    const field = await provider.fetchWindField(BOUNDS, 2)

    expect(field.samples).toHaveLength(4)
    expect(field.timezone).toBe('America/Toronto')
    expect(field.samples[0].hourly).toEqual([
      { time: '2026-08-17T10:00', directionDegrees: 270, speedKmh: 12.3, gustsKmh: 21.1 },
      { time: '2026-08-17T11:00', directionDegrees: 280, speedKmh: 14.0, gustsKmh: 23.5 },
    ])
  })

  it('normalizes a single-location (non-array) response into a one-sample field', async () => {
    stubFetch(FAKE_LOCATION) // not wrapped in an array
    const provider = new OpenMeteoWindProvider()

    const field = await provider.fetchWindField(BOUNDS, 1)

    expect(field.samples).toHaveLength(1)
  })

  it('throws on a non-OK response rather than returning fabricated data', async () => {
    stubFetch(null, false, 503)
    const provider = new OpenMeteoWindProvider()

    await expect(provider.fetchWindField(BOUNDS, 2)).rejects.toThrow(/503/)
  })
})
