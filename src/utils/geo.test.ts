import { describe, expect, it } from 'vitest'
import {
  SQUARE_METERS_PER_ACRE,
  birdFlightDistanceMeters,
  haversineMeters,
  isSelfIntersecting,
  pathLength3DMeters,
  polygonAreaSquareMeters,
  polygonPerimeterMeters,
  squareMetersToAcres,
  squareMetersToHectares,
  totalDistanceMeters,
} from './geo'

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

/** Corners of the lat/lng box [south, north] x [west, east]. */
function box(south: number, north: number, west: number, east: number) {
  return [
    { lat: south, lng: west },
    { lat: south, lng: east },
    { lat: north, lng: east },
    { lat: north, lng: west },
  ]
}

describe('polygonAreaSquareMeters', () => {
  // Independent reference (NOT computed by the code under test): area of a
  // lat/lng band on a sphere of radius 6 371 000 m is R² · Δλ · (sin φ2 − sin φ1).
  // 0.01° x 0.01° at 46.80°N → 846 316.7206 m² (python: math.sin, radians).
  const RECT_REFERENCE_M2 = 846_316.7206261174

  it('matches the spherical band reference for a 0.01° x 0.01° box at 46.8°N', () => {
    const area = polygonAreaSquareMeters(box(46.8, 46.81, -71.2, -71.19))
    // Great-circle edges bulge a few mm off the parallels: 1e-4 is generous
    // (the real gap is ~7e-6) and still far tighter than any projection error.
    expect(Math.abs(area - RECT_REFERENCE_M2) / RECT_REFERENCE_M2).toBeLessThan(1e-4)
  })

  it('does not depend on orientation, start vertex or a repeated closing point', () => {
    const ring = box(46.8, 46.81, -71.2, -71.19)
    const base = polygonAreaSquareMeters(ring)
    expect(polygonAreaSquareMeters([...ring].reverse())).toBeCloseTo(base, 3)
    expect(polygonAreaSquareMeters([ring[2], ring[3], ring[0], ring[1]])).toBeCloseTo(
      base,
      3,
    )
    expect(polygonAreaSquareMeters([...ring, ring[0]])).toBeCloseTo(base, 3)
  })

  it('is not fooled by Web-Mercator / planar degrees at 60°N', () => {
    // Reference band 60°→61°N, 1° wide: 6 088 401 114 m² (≈ 6 088 km²).
    const area = polygonAreaSquareMeters(box(60, 61, 0, 1))
    expect(Math.abs(area - 6_088_401_114) / 6_088_401_114).toBeLessThan(2e-3)
    // Shoelace in EPSG:3857 metres gives 25 111 408 892 m² (~4.1x too big, 1/cos²φ);
    // 1°x1° taken as a flat 111.19 km square gives 12 364 311 711 m² (~2x too big).
    expect(area).toBeLessThan(25_111_408_892 / 4)
    expect(area).toBeLessThan(12_364_311_711 / 1.9)
  })

  it('gives π R² / 2 for the octant triangle (equator, 0°, 90°E, north pole)', () => {
    const area = polygonAreaSquareMeters([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 90 },
      { lat: 90, lng: 0 },
    ])
    expect(Math.abs(area - 63_758_058_988_723.53) / 63_758_058_988_723.53).toBeLessThan(
      1e-9,
    )
  })

  it('is 0 (never NaN) for 0, 1, 2 points, duplicates and collinear points', () => {
    const p = { lat: 46.8, lng: -71.2 }
    expect(polygonAreaSquareMeters([])).toBe(0)
    expect(polygonAreaSquareMeters([p])).toBe(0)
    expect(polygonAreaSquareMeters([p, { lat: 46.81, lng: -71.2 }])).toBe(0)
    expect(polygonAreaSquareMeters([p, p, p])).toBe(0)
    const collinear = polygonAreaSquareMeters([
      p,
      { lat: 46.81, lng: -71.2 },
      { lat: 46.82, lng: -71.2 },
    ])
    expect(collinear).toBeCloseTo(0, 3)
    expect(Number.isNaN(collinear)).toBe(false)
  })

  it('stays finite across the antimeridian', () => {
    const area = polygonAreaSquareMeters(box(46.8, 46.81, 179.995, -179.995))
    expect(Number.isFinite(area)).toBe(true)
    expect(Math.abs(area - RECT_REFERENCE_M2) / RECT_REFERENCE_M2).toBeLessThan(2e-3)
  })
})

describe('polygonPerimeterMeters', () => {
  it('closes the ring (reference 3 746.12 m for the 0.01° box at 46.8°N)', () => {
    const perimeter = polygonPerimeterMeters(box(46.8, 46.81, -71.2, -71.19))
    expect(perimeter).toBeCloseTo(3746.1203526, 3)
  })

  it('is 0 below 3 points', () => {
    expect(polygonPerimeterMeters([])).toBe(0)
    expect(
      polygonPerimeterMeters([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.81, lng: -71.2 },
      ]),
    ).toBe(0)
  })
})

describe('isSelfIntersecting', () => {
  it('is false for a simple box and for fewer than 4 points', () => {
    expect(isSelfIntersecting(box(46.8, 46.81, -71.2, -71.19))).toBe(false)
    expect(isSelfIntersecting([])).toBe(false)
    expect(
      isSelfIntersecting([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.81, lng: -71.2 },
        { lat: 46.8, lng: -71.19 },
      ]),
    ).toBe(false)
  })

  it('detects a bow-tie (two edges cross)', () => {
    expect(
      isSelfIntersecting([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.81, lng: -71.19 },
        { lat: 46.8, lng: -71.19 },
        { lat: 46.81, lng: -71.2 },
      ]),
    ).toBe(true)
  })

  it('does not flag a repeated vertex as a crossing', () => {
    const ring = box(46.8, 46.81, -71.2, -71.19)
    expect(isSelfIntersecting([ring[0], ring[1], ring[1], ring[2], ring[3]])).toBe(false)
  })

  it('accepts a concave (L-shaped) polygon', () => {
    expect(
      isSelfIntersecting([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.8, lng: -71.18 },
        { lat: 46.805, lng: -71.18 },
        { lat: 46.805, lng: -71.19 },
        { lat: 46.81, lng: -71.19 },
        { lat: 46.81, lng: -71.2 },
      ]),
    ).toBe(false)
  })
})

describe('area unit conversions', () => {
  it('uses the exact acre and hectare definitions', () => {
    expect(SQUARE_METERS_PER_ACRE).toBe(4046.8564224)
    expect(squareMetersToHectares(34_500)).toBeCloseTo(3.45, 10)
    expect(squareMetersToAcres(4046.8564224)).toBe(1)
    // 1 ha = 2.4710538146717 acres (reference value)
    expect(squareMetersToAcres(10_000)).toBeCloseTo(2.471053814671653, 12)
  })
})

describe('birdFlightDistanceMeters', () => {
  it('is first → last, not the path length', () => {
    const points = [
      { lat: 46.8, lng: -71.2 },
      { lat: 46.8, lng: -71.19 },
      { lat: 46.8, lng: -71.2 },
    ]
    expect(birdFlightDistanceMeters(points)).toBe(0)
    expect(totalDistanceMeters(points)).toBeGreaterThan(1000)
    expect(birdFlightDistanceMeters(points.slice(0, 1))).toBe(0)
    expect(birdFlightDistanceMeters([])).toBe(0)
  })
})

describe('pathLength3DMeters', () => {
  const a = { lat: 46.8, lng: -71.2 }
  const b = { lat: 46.8, lng: -71.19 }

  it('adds the elevation difference to the horizontal distance (Pythagoras)', () => {
    const horizontal = haversineMeters(a, b)
    const result = pathLength3DMeters([a, b], [100, 100 + horizontal])
    expect(result).toBeCloseTo(horizontal * Math.SQRT2, 6)
  })

  it('equals the 2D length on flat ground', () => {
    expect(pathLength3DMeters([a, b], [250, 250])).toBeCloseTo(haversineMeters(a, b), 9)
  })

  it('is null as soon as ONE elevation is missing, or the counts differ', () => {
    expect(pathLength3DMeters([a, b, a], [100, null, 100])).toBeNull()
    expect(pathLength3DMeters([a, b], [100, Number.NaN])).toBeNull()
    expect(pathLength3DMeters([a, b], [100])).toBeNull()
    expect(pathLength3DMeters([a], [100])).toBeNull()
  })
})
