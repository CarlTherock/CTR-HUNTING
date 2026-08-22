import { describe, expect, it } from 'vitest'
import { computeHeatmapCell } from './heatmapEngine'
import type { WeatherForecast, WindField } from '@/types'

const COORDINATE = { lat: 46.8, lng: -71.2 }

const WIND_FIELD: WindField = {
  timezone: 'America/Toronto',
  samples: [
    {
      coordinate: COORDINATE,
      hourly: [
        {
          time: '2026-08-17T10:00',
          directionDegrees: 270,
          speedKmh: 15,
          gustsKmh: 20,
          temperatureCelsius: 18,
          precipitationMm: 0,
          cloudCoverPercent: 30,
        },
      ],
    },
  ],
}

const WEATHER: WeatherForecast = {
  timezone: 'America/Toronto',
  current: {
    timestamp: '2026-08-17T10:00',
    temperatureCelsius: 18,
    relativeHumidityPercent: 55,
    surfacePressureHpa: 1013,
    precipitationMm: 0,
    cloudCoverPercent: 30,
    windSpeedKmh: 10,
    windGustsKmh: 15,
    visibilityMeters: 20000,
  },
  hourly: [],
}

describe('computeHeatmapCell', () => {
  it('runs all 6 analyzers for one grid point and combines them', () => {
    const cell = computeHeatmapCell(
      COORDINATE,
      () => 300,
      WIND_FIELD,
      WEATHER,
      { coordinate: COORDINATE, radiusMeters: 300, categoryCounts: { forest: 1 }, source: 'openstreetmap' },
      [],
      [],
      new Date('2026-08-17T10:00:00.000Z'),
    )

    expect(cell.coordinate).toEqual(COORDINATE)
    expect(cell.combined.results).toHaveLength(6)
    expect(cell.combined.overallScore).not.toBeNull()
  })

  it('reports terrain and vegetation as unavailable when there is nothing real to use', () => {
    const cell = computeHeatmapCell(
      COORDINATE,
      () => null, // no elevation data at this cell
      WIND_FIELD,
      WEATHER,
      null, // no vegetation data at this cell
      [],
      [],
      new Date('2026-08-17T10:00:00.000Z'),
    )

    const terrain = cell.combined.results.find((r) => r.analyzer === 'terrain')
    const vegetation = cell.combined.results.find((r) => r.analyzer === 'vegetation')
    expect(terrain?.score).toBeNull()
    expect(vegetation?.score).toBeNull()
    // The other 4 analyzers still produce a real result.
    expect(cell.combined.overallScore).not.toBeNull()
  })
})
