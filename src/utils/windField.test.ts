import { describe, expect, it } from 'vitest'
import { advancePosition, isOptimalWind, nearestSample, octantOf, windAt } from './windField'
import type { WindField } from '@/types'

const FIELD: WindField = {
  timezone: 'America/Toronto',
  samples: [
    {
      coordinate: { lat: 46.8, lng: -71.2 },
      hourly: [
        {
          time: '2026-08-17T10:00',
          directionDegrees: 0,
          speedKmh: 10,
          gustsKmh: 15,
          temperatureCelsius: 18,
          precipitationMm: 0,
          cloudCoverPercent: 20,
        },
        {
          time: '2026-08-17T11:00',
          directionDegrees: 90,
          speedKmh: 20,
          gustsKmh: 30,
          temperatureCelsius: 19,
          precipitationMm: 1.2,
          cloudCoverPercent: 60,
        },
      ],
    },
    {
      coordinate: { lat: 47.5, lng: -70.0 },
      hourly: [
        {
          time: '2026-08-17T10:00',
          directionDegrees: 180,
          speedKmh: 5,
          gustsKmh: 8,
          temperatureCelsius: 15,
          precipitationMm: 0,
          cloudCoverPercent: 10,
        },
        {
          time: '2026-08-17T11:00',
          directionDegrees: 270,
          speedKmh: 12,
          gustsKmh: 18,
          temperatureCelsius: 16,
          precipitationMm: 0,
          cloudCoverPercent: 25,
        },
      ],
    },
  ],
}

describe('nearestSample', () => {
  it('returns null for an empty field', () => {
    expect(nearestSample({ timezone: 'UTC', samples: [] }, { lat: 0, lng: 0 })).toBeNull()
  })

  it('picks the closer of two real samples, never an interpolated value', () => {
    const result = nearestSample(FIELD, { lat: 46.81, lng: -71.19 })
    expect(result?.coordinate).toEqual({ lat: 46.8, lng: -71.2 })
  })

  it('picks the other sample when it really is closer', () => {
    const result = nearestSample(FIELD, { lat: 47.4, lng: -70.1 })
    expect(result?.coordinate).toEqual({ lat: 47.5, lng: -70.0 })
  })
})

describe('windAt', () => {
  it('returns the real hourly reading at the given offset for the nearest sample', () => {
    const reading = windAt(FIELD, { lat: 46.81, lng: -71.19 }, 1)
    expect(reading).toEqual({
      time: '2026-08-17T11:00',
      directionDegrees: 90,
      speedKmh: 20,
      gustsKmh: 30,
      temperatureCelsius: 19,
      precipitationMm: 1.2,
      cloudCoverPercent: 60,
    })
  })

  it('returns null for an hour offset out of range, never a guess', () => {
    expect(windAt(FIELD, { lat: 46.8, lng: -71.2 }, 99)).toBeNull()
  })
})

describe('advancePosition', () => {
  it('moves toward the opposite of the meteorological "from" direction', () => {
    // Wind FROM the north (0°) blows TOWARD the south — latitude decreases.
    const next = advancePosition({ lat: 46.8, lng: -71.2 }, { directionDegrees: 0, speedKmh: 20, gustsKmh: 20 }, 1, 100)
    expect(next.lat).toBeLessThan(46.8)
    expect(next.lng).toBeCloseTo(-71.2, 5)
  })

  it('moves east when the wind is from the west', () => {
    const next = advancePosition({ lat: 46.8, lng: -71.2 }, { directionDegrees: 270, speedKmh: 20, gustsKmh: 20 }, 1, 100)
    expect(next.lng).toBeGreaterThan(-71.2)
  })

  it('moves further for a higher speedScale, same real wind data', () => {
    const wind = { directionDegrees: 0, speedKmh: 20, gustsKmh: 20 }
    const start = { lat: 46.8, lng: -71.2 }
    const slow = advancePosition(start, wind, 1, 10)
    const fast = advancePosition(start, wind, 1, 100)
    expect(Math.abs(fast.lat - start.lat)).toBeGreaterThan(Math.abs(slow.lat - start.lat))
  })
})

describe('octantOf', () => {
  it('maps cardinal and ordinal directions to the right octant', () => {
    expect(octantOf(0)).toBe(0)
    expect(octantOf(44)).toBe(45)
    expect(octantOf(46)).toBe(45)
    expect(octantOf(90)).toBe(90)
    expect(octantOf(359)).toBe(0)
  })

  it('wraps negative degrees correctly', () => {
    expect(octantOf(-45)).toBe(315)
  })
})

describe('isOptimalWind', () => {
  it('is false when no preference is set', () => {
    expect(isOptimalWind(0, undefined)).toBe(false)
    expect(isOptimalWind(0, [])).toBe(false)
  })

  it('is true only when the wind direction matches a saved octant', () => {
    expect(isOptimalWind(10, [0, 45])).toBe(true) // 10° rounds to octant 0
    expect(isOptimalWind(200, [0, 45])).toBe(false)
  })
})
