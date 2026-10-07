import { describe, expect, it } from 'vitest'
import {
  initialBearingDegrees,
  normalizeDegrees,
  relativeAngle,
  shortestAngleDelta,
  unwrapAngle,
} from './angles'

describe('normalizeDegrees', () => {
  it('maps angles into [0, 360)', () => {
    expect(normalizeDegrees(0)).toBe(0)
    expect(normalizeDegrees(360)).toBe(0)
    expect(normalizeDegrees(-90)).toBe(270)
    expect(normalizeDegrees(725)).toBe(5)
    expect(normalizeDegrees(-1e-15)).toBe(0)
  })

  it('does not invent a value for non-finite input', () => {
    expect(normalizeDegrees(Number.NaN)).toBeNaN()
    expect(normalizeDegrees(Infinity)).toBeNaN()
  })
})

describe('shortestAngleDelta', () => {
  it('goes the short way around and stays in (-180, 180]', () => {
    expect(shortestAngleDelta(350, 10)).toBe(20)
    expect(shortestAngleDelta(10, 350)).toBe(-20)
    expect(shortestAngleDelta(0, 180)).toBe(180)
    expect(shortestAngleDelta(180, 0)).toBe(180)
    expect(shortestAngleDelta(90, 90)).toBe(0)
    expect(shortestAngleDelta(0, 181)).toBe(-179)
  })
})

describe('relativeAngle', () => {
  it('is 0 straight ahead, positive to the right, negative to the left', () => {
    expect(relativeAngle(90, 90)).toBe(0)
    expect(relativeAngle(120, 90)).toBe(30)
    expect(relativeAngle(60, 90)).toBe(-30)
    expect(relativeAngle(270, 90)).toBe(180)
  })

  it('wraps across north', () => {
    expect(relativeAngle(10, 350)).toBe(20)
    expect(relativeAngle(350, 10)).toBe(-20)
  })
})

describe('unwrapAngle', () => {
  it('uses the next angle when there is no previous one', () => {
    expect(unwrapAngle(null, 42)).toBe(42)
  })

  it('crosses 359 -> 0 without a long spin', () => {
    expect(unwrapAngle(359, 0)).toBe(360)
    expect(unwrapAngle(350, 5)).toBe(365)
  })

  it('crosses 0 -> 359 without a long spin', () => {
    expect(unwrapAngle(0, 359)).toBe(-1)
    expect(unwrapAngle(5, 350)).toBe(-10)
  })

  it('keeps following an already unbounded display angle', () => {
    expect(unwrapAngle(360, 359)).toBe(359)
    expect(unwrapAngle(365, 10)).toBe(370)
    expect(unwrapAngle(-1, 1)).toBe(1)
  })

  it('never moves more than 180 degrees in one step', () => {
    let shown: number | null = null
    for (const angle of [10, 100, 190, 280, 10, 100, 350, 0]) {
      const next: number = unwrapAngle(shown, angle)
      if (shown !== null) expect(Math.abs(next - shown)).toBeLessThanOrEqual(180)
      expect(normalizeDegrees(next)).toBeCloseTo(angle % 360, 9)
      shown = next
    }
  })
})

describe('initialBearingDegrees', () => {
  const quebec = { lat: 46.8139, lng: -71.208 }
  const montreal = { lat: 45.5019, lng: -73.5674 }
  const paris = { lat: 48.8566, lng: 2.3522 }
  const london = { lat: 51.5074, lng: -0.1278 }
  const newYork = { lat: 40.7128, lng: -74.006 }

  it('returns the true-north bearing between known city pairs', () => {
    // Québec -> Montréal: south-west (flat-earth check: atan2(-1.64, -1.31) = 231.3).
    expect(initialBearingDegrees(quebec, montreal)).toBeCloseTo(232.1, 0)
    // Paris -> London: north-north-west.
    expect(initialBearingDegrees(paris, london)).toBeCloseTo(330.0, 0)
    // New York -> London: north-east, initial great-circle bearing ~51 deg.
    expect(initialBearingDegrees(newYork, london)).toBeCloseTo(51.2, 0)
  })

  it('gives the cardinal directions on a small offset', () => {
    const origin = { lat: 46, lng: -71 }
    expect(initialBearingDegrees(origin, { lat: 46.01, lng: -71 })).toBeCloseTo(0, 5)
    expect(initialBearingDegrees(origin, { lat: 46, lng: -70.99 })).toBeCloseTo(90, 1)
    expect(initialBearingDegrees(origin, { lat: 45.99, lng: -71 })).toBeCloseTo(180, 5)
    expect(initialBearingDegrees(origin, { lat: 46, lng: -71.01 })).toBeCloseTo(270, 1)
  })

  it('is always in [0, 360)', () => {
    for (const to of [quebec, montreal, paris, london, newYork]) {
      const bearing = initialBearingDegrees({ lat: 0, lng: 0 }, to)
      expect(bearing).not.toBeNull()
      expect(bearing as number).toBeGreaterThanOrEqual(0)
      expect(bearing as number).toBeLessThan(360)
    }
  })

  it('crosses the antimeridian the short way', () => {
    expect(
      initialBearingDegrees({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }),
    ).toBeCloseTo(90, 5)
    expect(
      initialBearingDegrees({ lat: 0, lng: -179 }, { lat: 0, lng: 179 }),
    ).toBeCloseTo(270, 5)
  })

  it('handles the poles', () => {
    expect(initialBearingDegrees({ lat: 90, lng: 0 }, { lat: 80, lng: 0 })).toBeCloseTo(
      180,
      5,
    )
    expect(initialBearingDegrees({ lat: -90, lng: 0 }, { lat: -80, lng: 0 })).toBeCloseTo(
      0,
      5,
    )
    expect(initialBearingDegrees({ lat: 80, lng: 30 }, { lat: 90, lng: 0 })).toBeCloseTo(
      0,
      5,
    )
  })

  it('has no direction for identical points or unusable coordinates', () => {
    expect(initialBearingDegrees(quebec, { ...quebec })).toBeNull()
    expect(initialBearingDegrees({ lat: 90, lng: 0 }, { lat: 90, lng: 120 })).toBeNull()
    expect(initialBearingDegrees({ lat: Number.NaN, lng: 0 }, quebec)).toBeNull()
    expect(initialBearingDegrees(quebec, { lat: 91, lng: 0 })).toBeNull()
  })
})
