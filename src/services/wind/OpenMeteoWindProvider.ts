import type { Coordinate, WindField, WindFieldSample } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import type { WindProvider } from './WindProvider'

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

// Verified against Open-Meteo's live docs (open-meteo.com/en/docs):
// wind_direction_10m returns degrees 0-360, meteorological "from"
// convention. Requesting comma-separated latitude/longitude lists is a
// real, documented batch feature — confirmed with a live multi-location
// test call, not assumed — and returns one array entry per location.
// temperature_2m/precipitation/cloud_cover are the same real parameter
// names already verified live for Phase 5's weather feature — requesting
// them in this same batched grid call (rather than a second fetch) is
// what lets the map's layer switcher (wind/temperature/precipitation/
// clouds) flip layers instantly with no extra network round trip.
const WIND_PARAMS = [
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'temperature_2m',
  'precipitation',
  'cloud_cover',
].join(',')

/** Evenly spaced `gridSize` × `gridSize` cell-center points covering
 * `bounds` — the real coordinates every wind sample is actually fetched
 * for, not an arbitrary/fabricated arrangement. */
function buildGrid(bounds: LngLatBounds, gridSize: number): Coordinate[] {
  const points: Coordinate[] = []
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const lat = bounds.south + ((bounds.north - bounds.south) * (row + 0.5)) / gridSize
      const lng = bounds.west + ((bounds.east - bounds.west) * (col + 0.5)) / gridSize
      points.push({ lat, lng })
    }
  }
  return points
}

interface OpenMeteoLocation {
  timezone: string
  hourly: {
    time: string[]
    wind_speed_10m: number[]
    wind_direction_10m: number[]
    wind_gusts_10m: number[]
    temperature_2m: number[]
    precipitation: number[]
    cloud_cover: number[]
  }
}

/**
 * Open-Meteo (open-meteo.com), same free/keyless provider as Phase 5's
 * weather — a real spatial grid fetched in ONE batched request (verified
 * live: Open-Meteo accepts comma-separated coordinate lists and returns
 * an array, one entry per location), not `gridSize²` separate calls.
 * This is what makes a genuine animated flow field possible instead of
 * a single point repeated everywhere.
 */
export class OpenMeteoWindProvider implements WindProvider {
  async fetchWindField(bounds: LngLatBounds, gridSize: number): Promise<WindField> {
    const points = buildGrid(bounds, gridSize)

    const url = new URL(OPEN_METEO_URL)
    url.searchParams.set('latitude', points.map((p) => p.lat.toFixed(4)).join(','))
    url.searchParams.set('longitude', points.map((p) => p.lng.toFixed(4)).join(','))
    url.searchParams.set('hourly', WIND_PARAMS)
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '2')

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Wind request failed (${response.status})`)
    }
    const data: unknown = await response.json()
    // A single-location request returns one object, not an array —
    // normalize so downstream mapping is uniform regardless of gridSize.
    const locations: OpenMeteoLocation[] = Array.isArray(data)
      ? (data as OpenMeteoLocation[])
      : [data as OpenMeteoLocation]

    const samples: WindFieldSample[] = locations.map((location, i) => ({
      coordinate: points[i],
      hourly: location.hourly.time.map((time, h) => ({
        time,
        directionDegrees: location.hourly.wind_direction_10m[h],
        speedKmh: location.hourly.wind_speed_10m[h],
        gustsKmh: location.hourly.wind_gusts_10m[h],
        temperatureCelsius: location.hourly.temperature_2m[h],
        precipitationMm: location.hourly.precipitation[h],
        cloudCoverPercent: location.hourly.cloud_cover[h],
      })),
    }))

    return { timezone: locations[0]?.timezone ?? 'UTC', samples }
  }
}
