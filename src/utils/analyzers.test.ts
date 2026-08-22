import { describe, expect, it } from 'vitest'
import {
  combineAnalyses,
  historyAnalyzer,
  terrainAnalyzer,
  timeAnalyzer,
  vegetationAnalyzer,
  weatherAnalyzer,
  windAnalyzer,
} from './analyzers'
import type { AnalyzerResult, TemporalData, Track, VegetationSample, WeatherConditions, Waypoint } from '@/types'

/** Asserts a real (non-null) score and hands it back as a plain number,
 * without a forbidden `!` non-null assertion. */
function expectScore(result: AnalyzerResult): number {
  expect(result.score).not.toBeNull()
  return result.score as number
}

describe('terrainAnalyzer', () => {
  it('is unavailable with no elevation data', () => {
    const result = terrainAnalyzer(null)
    expect(result.score).toBeNull()
    expect(result.confidence).toBe('unavailable')
    expect(result.unavailableReason).toBeDefined()
  })

  it('scores a moderate slope above baseline, with real explanatory factors', () => {
    const result = terrainAnalyzer({ slopeDegrees: 12, aspectDegrees: 180 })
    expect(expectScore(result)).toBeGreaterThan(50)
    expect(result.factors.length).toBeGreaterThan(0)
    expect(result.factors[0].explanation).toContain('12°')
  })

  it('scores a very steep slope below baseline', () => {
    const result = terrainAnalyzer({ slopeDegrees: 40, aspectDegrees: 90 })
    expect(expectScore(result)).toBeLessThan(50)
  })
})

describe('vegetationAnalyzer', () => {
  const COORDINATE = { lat: 46.8, lng: -71.2 }

  it('is unavailable with no sample', () => {
    expect(vegetationAnalyzer(null).score).toBeNull()
  })

  it('is unavailable with an empty sample (no real land cover found)', () => {
    const sample: VegetationSample = {
      coordinate: COORDINATE,
      radiusMeters: 300,
      categoryCounts: {},
      source: 'openstreetmap',
    }
    expect(vegetationAnalyzer(sample).score).toBeNull()
  })

  it('scores above baseline with water and forest cover nearby', () => {
    const sample: VegetationSample = {
      coordinate: COORDINATE,
      radiusMeters: 300,
      categoryCounts: { forest: 3, water: 1 },
      source: 'openstreetmap',
    }
    const result = vegetationAnalyzer(sample)
    expect(expectScore(result)).toBeGreaterThan(50)
  })

  it('scores below baseline with developed land nearby', () => {
    const sample: VegetationSample = {
      coordinate: COORDINATE,
      radiusMeters: 300,
      categoryCounts: { developed: 2 },
      source: 'openstreetmap',
    }
    const result = vegetationAnalyzer(sample)
    expect(expectScore(result)).toBeLessThan(50)
  })

  it('flags habitat edge when multiple distinct categories are present', () => {
    const sample: VegetationSample = {
      coordinate: COORDINATE,
      radiusMeters: 300,
      categoryCounts: { forest: 2, agricultural: 1 },
      source: 'openstreetmap',
    }
    const result = vegetationAnalyzer(sample)
    expect(result.factors.some((f) => f.label === 'Habitat edge')).toBe(true)
  })
})

describe('weatherAnalyzer', () => {
  const BASE: WeatherConditions = {
    timestamp: '2026-08-17T10:00',
    temperatureCelsius: 15,
    relativeHumidityPercent: 50,
    surfacePressureHpa: 1015,
    precipitationMm: 0,
    cloudCoverPercent: 30,
    windSpeedKmh: 10,
    windGustsKmh: 15,
    visibilityMeters: 20000,
  }

  it('is unavailable with no weather data', () => {
    expect(weatherAnalyzer(null, []).score).toBeNull()
  })

  it('favors falling pressure and light-moderate wind', () => {
    const result = weatherAnalyzer(BASE, [
      { ...BASE, time: '2026-08-17T13:00', surfacePressureHpa: 1010, visibilityMeters: 20000 },
    ])
    expect(expectScore(result)).toBeGreaterThan(50)
  })

  it('penalizes high wind and heavy precipitation', () => {
    const result = weatherAnalyzer(
      { ...BASE, windSpeedKmh: 50, precipitationMm: 8 },
      [{ ...BASE, time: '2026-08-17T13:00', surfacePressureHpa: 1015, visibilityMeters: 20000 }],
    )
    expect(expectScore(result)).toBeLessThan(50)
  })
})

describe('windAnalyzer', () => {
  const READING = { time: '2026-08-17T10:00', directionDegrees: 270, speedKmh: 15, gustsKmh: 20, temperatureCelsius: 18, precipitationMm: 0, cloudCoverPercent: 30 }

  it('is unavailable with no reading', () => {
    expect(windAnalyzer(null, undefined).score).toBeNull()
  })

  it('scores above baseline when wind matches optimal directions', () => {
    const result = windAnalyzer(READING, [270])
    expect(expectScore(result)).toBeGreaterThan(50)
    expect(result.confidence).toBe('user_observation') // weakest link
  })

  it('scores below baseline when wind does not match optimal directions', () => {
    const result = windAnalyzer(READING, [0, 45])
    expect(expectScore(result)).toBeLessThan(50)
  })

  it('has no optimal-match factor when no preference is saved', () => {
    const result = windAnalyzer(READING, undefined)
    expect(result.factors.some((f) => f.label.includes('optimal'))).toBe(false)
  })
})

describe('timeAnalyzer', () => {
  const DATA: TemporalData = {
    date: '2026-08-17',
    sun: {
      sunrise: '2026-08-17T09:45:00.000Z',
      sunset: '2026-08-17T23:51:00.000Z',
      dawn: null,
      dusk: null,
      solarNoon: '2026-08-17T16:48:00.000Z',
      goldenHourStart: null,
      goldenHourEnd: null,
      dayLengthMs: 14 * 3600_000,
    },
    moon: { rise: null, set: null, alwaysUp: false, alwaysDown: false },
    illumination: { fraction: 0.2, phase: 0.1, waxing: true, phaseName: 'Waxing Crescent' },
    solunarPeriods: [
      { type: 'major', start: '2026-08-17T09:00:00.000Z', end: '2026-08-17T11:00:00.000Z' },
    ],
  }

  it('scores higher within the dawn/dusk crepuscular window', () => {
    const near = timeAnalyzer(DATA, new Date('2026-08-17T09:50:00.000Z'))
    const midday = timeAnalyzer(DATA, new Date('2026-08-17T16:00:00.000Z'))
    expect(expectScore(near)).toBeGreaterThan(expectScore(midday))
  })

  it('detects an active major solunar period', () => {
    const result = timeAnalyzer(DATA, new Date('2026-08-17T10:00:00.000Z'))
    expect(result.factors.some((f) => f.label.includes('Major solunar'))).toBe(true)
  })

  it('flags near-full moon as a real (anecdotal) factor', () => {
    const fullMoonData = { ...DATA, illumination: { ...DATA.illumination, fraction: 0.98 } }
    const result = timeAnalyzer(fullMoonData, new Date('2026-08-17T16:00:00.000Z'))
    expect(result.factors.some((f) => f.label.includes('full moon'))).toBe(true)
  })
})

describe('historyAnalyzer', () => {
  const COORDINATE = { lat: 46.8, lng: -71.2 }

  function makeWaypoint(overrides: Partial<Waypoint>): Waypoint {
    return {
      id: 'wp',
      name: 'Test',
      coordinate: { lat: 46.8, lng: -71.2 },
      category: 'general',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      ...overrides,
    }
  }

  it('scores above baseline with nearby real game-sign waypoints', () => {
    const waypoints = [makeWaypoint({ category: 'game_sign' }), makeWaypoint({ category: 'kill_site' })]
    const result = historyAnalyzer(COORDINATE, waypoints, [])
    expect(expectScore(result)).toBeGreaterThan(50)
  })

  it('ignores game-sign waypoints far away', () => {
    const waypoints = [makeWaypoint({ category: 'game_sign', coordinate: { lat: 10, lng: 10 } })]
    const result = historyAnalyzer(COORDINATE, waypoints, [])
    expect(result.score).toBe(50)
  })

  it('scores above baseline with a real past track passing nearby', () => {
    const tracks: Track[] = [
      {
        id: 't1',
        name: 'Track',
        points: [{ lat: 46.8, lng: -71.2, timestamp: '2026-08-01T00:00:00.000Z' }],
        startedAt: '2026-08-01T00:00:00.000Z',
      },
    ]
    const result = historyAnalyzer(COORDINATE, [], tracks)
    expect(expectScore(result)).toBeGreaterThan(50)
  })

  it('never returns unavailable — zero history is still a real (neutral) result', () => {
    const result = historyAnalyzer(COORDINATE, [], [])
    expect(result.score).toBe(50)
    expect(result.confidence).not.toBe('unavailable')
  })
})

describe('combineAnalyses', () => {
  it('averages only the analyzers that produced a real score', () => {
    const combined = combineAnalyses([
      terrainAnalyzer({ slopeDegrees: 12, aspectDegrees: 180 }),
      terrainAnalyzer(null), // unavailable, must be excluded from the average
    ])
    expect(combined.overallScore).not.toBeNull()
    expect(combined.results).toHaveLength(2)
  })

  it('is null when every analyzer is unavailable', () => {
    const combined = combineAnalyses([terrainAnalyzer(null), windAnalyzer(null, undefined)])
    expect(combined.overallScore).toBeNull()
  })
})
