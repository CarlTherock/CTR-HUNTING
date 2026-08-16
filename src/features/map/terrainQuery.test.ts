import { describe, expect, it } from 'vitest'
import { sampleElevationProfile, sampleSlopeAspect } from './terrainQuery'

describe('sampleSlopeAspect', () => {
  it('returns null if any of the 4 neighbor samples is unavailable', () => {
    const queryElevation = () => null
    expect(sampleSlopeAspect(queryElevation, { lat: 46.8, lng: -71.2 })).toBeNull()
  })

  it('computes a real slope/aspect from 4 real elevation samples', () => {
    // A simple ramp rising to the north — north sample higher, south lower.
    const queryElevation = ({ lat }: { lat: number; lng: number }) =>
      lat > 46.8 ? 110 : lat < 46.8 ? 90 : 100
    const result = sampleSlopeAspect(queryElevation, { lat: 46.8, lng: -71.2 })

    expect(result).not.toBeNull()
    expect(result?.slopeDegrees).toBeGreaterThan(0)
    expect(result?.aspectDegrees).toBeCloseTo(180, 0) // downhill faces south
  })
})

describe('sampleElevationProfile', () => {
  it('returns nothing for fewer than 2 points', () => {
    expect(sampleElevationProfile(() => 100, [])).toEqual([])
    expect(sampleElevationProfile(() => 100, [{ lat: 46.8, lng: -71.2 }])).toEqual([])
  })

  it('samples from 0 to the real total path distance', () => {
    const points = [
      { lat: 46.8, lng: -71.2 },
      { lat: 46.81, lng: -71.2 },
    ]
    const profile = sampleElevationProfile(() => 100, points, 10)

    expect(profile).toHaveLength(11) // sampleCount + 1
    expect(profile[0].distanceMeters).toBe(0)
    expect(profile.at(-1)?.distanceMeters).toBeGreaterThan(1000) // ~0.01° lat ≈ 1.1km
  })

  it('reports null elevation for samples where the query itself returns null', () => {
    const points = [
      { lat: 46.8, lng: -71.2 },
      { lat: 46.81, lng: -71.2 },
    ]
    const profile = sampleElevationProfile(() => null, points, 4)
    expect(profile.every((p) => p.elevationMeters === null)).toBe(true)
  })

  it('interpolates across multiple segments, not just the first', () => {
    const points = [
      { lat: 46.8, lng: -71.2 },
      { lat: 46.81, lng: -71.2 },
      { lat: 46.81, lng: -71.19 },
    ]
    const seen: { lat: number; lng: number }[] = []
    sampleElevationProfile(
      (c) => {
        seen.push(c)
        return 100
      },
      points,
      20,
    )
    // Some samples should have moved in longitude (second segment), not
    // just latitude (first segment) — confirms the whole path is covered.
    expect(seen.some((c) => Math.abs(c.lng - -71.2) > 0.001)).toBe(true)
  })
})
