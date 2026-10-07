import { describe, expect, it, vi } from 'vitest'
import { haversineMeters } from '@/utils/geo'
import { summarizeArea, summarizeDistance } from './measureSummary'

const A = { lat: 46.8, lng: -71.2 }
const B = { lat: 46.8, lng: -71.19 }
const C = { lat: 46.81, lng: -71.19 }

describe('summarizeDistance', () => {
  it('reports nothing (null, not 0) below 2 points and never asks for elevations', () => {
    const query = vi.fn(() => 100)
    for (const points of [[], [A]]) {
      const s = summarizeDistance(points, query)
      expect(s.pathMeters).toBeNull()
      expect(s.birdFlightMeters).toBeNull()
      expect(s.length3DMeters).toBeNull()
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('separates the path length from the first→last distance', () => {
    const s = summarizeDistance([A, B, A], () => null)
    expect(s.pathMeters).toBeCloseTo(2 * haversineMeters(A, B), 6)
    expect(s.birdFlightMeters).toBe(0)
  })

  it('computes the 3D length only from real elevations', () => {
    const s = summarizeDistance([A, B], (c) => (c === A ? 100 : 160))
    const horizontal = haversineMeters(A, B)
    expect(s.length3DMeters).toBeCloseTo(Math.hypot(horizontal, 60), 6)
    expect(s.missingElevationCount).toBe(0)
  })

  it('has no 3D figure when one point has no elevation, and counts the gaps', () => {
    const s = summarizeDistance([A, B, C], (c) => (c === B ? null : 100))
    expect(s.length3DMeters).toBeNull()
    expect(s.missingElevationCount).toBe(1)
    expect(s.pathMeters).toBeGreaterThan(0)
  })
})

describe('summarizeArea', () => {
  it('reports nothing below 3 points', () => {
    for (const points of [[], [A], [A, B]]) {
      const s = summarizeArea(points)
      expect(s.areaSquareMeters).toBeNull()
      expect(s.perimeterMeters).toBeNull()
      expect(s.selfIntersecting).toBe(false)
    }
  })

  it('gives area, perimeter and no warning for a simple triangle', () => {
    const s = summarizeArea([A, B, C])
    expect(s.areaSquareMeters).toBeGreaterThan(0)
    expect(s.perimeterMeters).toBeCloseTo(
      haversineMeters(A, B) + haversineMeters(B, C) + haversineMeters(C, A),
      6,
    )
    expect(s.selfIntersecting).toBe(false)
  })

  it('flags a bow-tie', () => {
    const s = summarizeArea([
      { lat: 46.8, lng: -71.2 },
      { lat: 46.81, lng: -71.19 },
      { lat: 46.8, lng: -71.19 },
      { lat: 46.81, lng: -71.2 },
    ])
    expect(s.selfIntersecting).toBe(true)
  })
})
