import { describe, expect, it } from 'vitest'
import { haversineMeters, totalDistanceMeters } from './geo'

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 46.8, lng: -71.2 }, { lat: 46.8, lng: -71.2 })).toBe(0)
  })

  it('matches a known reference distance (~1.11 km per degree of latitude at the equator)', () => {
    const distance = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(distance).toBeGreaterThan(110_000)
    expect(distance).toBeLessThan(112_000)
  })
})

describe('totalDistanceMeters', () => {
  it('is zero for fewer than two points', () => {
    expect(totalDistanceMeters([])).toBe(0)
    expect(totalDistanceMeters([{ lat: 46.8, lng: -71.2 }])).toBe(0)
  })

  it('sums consecutive segments, not a straight line end-to-end', () => {
    const points = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 0 },
      { lat: 1, lng: 1 },
    ]
    const total = totalDistanceMeters(points)
    const directEndToEnd = haversineMeters(points[0], points[2])
    expect(total).toBeGreaterThan(directEndToEnd)
  })
})
