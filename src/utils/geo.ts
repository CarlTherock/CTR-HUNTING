import type { Coordinate } from '@/types'

const EARTH_RADIUS_METERS = 6371000

/** Great-circle distance between two coordinates (Haversine formula) —
 * accurate enough for on-foot hunting distances; no need for a more
 * precise ellipsoidal model at this scale. */
export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Sums the distance between each consecutive pair of points — the total
 * length of a walked/recorded path, not a straight line end-to-end. */
export function totalDistanceMeters(points: Coordinate[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i])
  }
  return total
}

/** Exact definition of the international acre. */
export const SQUARE_METERS_PER_ACRE = 4046.8564224
export const SQUARE_METERS_PER_HECTARE = 10_000

export function squareMetersToHectares(squareMeters: number): number {
  return squareMeters / SQUARE_METERS_PER_HECTARE
}

export function squareMetersToAcres(squareMeters: number): number {
  return squareMeters / SQUARE_METERS_PER_ACRE
}

/** Drops repeated vertices (and a closing point equal to the first) so a
 * zero-length edge can neither skew a test nor be mistaken for a crossing. */
function removeConsecutiveDuplicates(points: Coordinate[]): Coordinate[] {
  const result: Coordinate[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (!last || last.lat !== point.lat || last.lng !== point.lng) result.push(point)
  }
  // A ring that repeats its first point at the end is the same ring.
  while (
    result.length > 1 &&
    result[0].lat === result[result.length - 1].lat &&
    result[0].lng === result[result.length - 1].lng
  ) {
    result.pop()
  }
  return result
}

/** Length of the closed ring (last point joined back to the first). 0 below
 * 3 points: a ring needs an interior. */
export function polygonPerimeterMeters(points: Coordinate[]): number {
  const ring = removeConsecutiveDuplicates(points)
  if (ring.length < 3) return 0
  return totalDistanceMeters([...ring, ring[0]])
}

/**
 * Geodesic area (m²) of a polygon on the same sphere as `haversineMeters`
 * (R = 6 371 km), edges being great-circle arcs.
 *
 * Each edge contributes the signed spherical excess of the triangle
 * (pole, p1, p2):  tan(E/2) = tan(Δλ/2)·(tan(φ1/2)+tan(φ2/2)) / (1+tan(φ1/2)·tan(φ2/2))
 * (Bevis & Cambareri). The sum over the ring is the enclosed excess, whatever
 * the ring's orientation. Nothing depends on screen pixels or on a map
 * projection, so Web-Mercator's latitude inflation cannot leak in.
 *
 * 0 below 3 distinct points. For a self-intersecting ring the value is the
 * signed (winding-weighted) area, which does not describe "the zone": use
 * `isSelfIntersecting` to warn. Sphere vs WGS84 ellipsoid: a few tenths of a
 * percent at most.
 */
export function polygonAreaSquareMeters(points: Coordinate[]): number {
  const ring = removeConsecutiveDuplicates(points)
  if (ring.length < 3) return 0
  const toRad = (deg: number) => (deg * Math.PI) / 180
  let excess = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    let dLng = toRad(b.lng - a.lng)
    // Take the short way round the globe.
    dLng = dLng - 2 * Math.PI * Math.round(dLng / (2 * Math.PI))
    const ta = Math.tan(toRad(a.lat) / 2)
    const tb = Math.tan(toRad(b.lat) / 2)
    excess += 2 * Math.atan2(Math.tan(dLng / 2) * (ta + tb), 1 + ta * tb)
  }
  const area = Math.abs(excess) * EARTH_RADIUS_METERS ** 2
  return Number.isFinite(area) ? area : 0
}

type Plane = { x: number; y: number }

function cross(o: Plane, a: Plane, b: Plane): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

function onSegment(a: Plane, b: Plane, p: Plane): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  )
}

function segmentsIntersect(a: Plane, b: Plane, c: Plane, d: Plane): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  )
    return true
  return (
    (d1 === 0 && onSegment(c, d, a)) ||
    (d2 === 0 && onSegment(c, d, b)) ||
    (d3 === 0 && onSegment(a, b, c)) ||
    (d4 === 0 && onSegment(a, b, d))
  )
}

/**
 * True when two non-adjacent edges of the closed ring cross or touch. Tested
 * in a local equirectangular plane (x = Δλ·cos φ̄): exact enough to decide
 * topology for hand-tapped polygons, never used for the area itself.
 */
export function isSelfIntersecting(points: Coordinate[]): boolean {
  const ring = removeConsecutiveDuplicates(points)
  if (ring.length < 4) return false
  const meanLat = ring.reduce((sum, p) => sum + p.lat, 0) / ring.length
  const k = Math.cos((meanLat * Math.PI) / 180)
  const plane = ring.map((p) => ({ x: p.lng * k, y: p.lat }))
  const n = plane.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Edges sharing a vertex are adjacent (including last/first).
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segmentsIntersect(plane[i], plane[(i + 1) % n], plane[j], plane[(j + 1) % n]))
        return true
    }
  }
  return false
}

/** Straight-line (great-circle) distance first → last point; 0 below 2 points. */
export function birdFlightDistanceMeters(points: Coordinate[]): number {
  if (points.length < 2) return 0
  return haversineMeters(points[0], points[points.length - 1])
}

/**
 * 3D path length: Σ √(horizontal² + Δz²) over the segments. `null` unless
 * EVERY point has a real elevation — a missing sample is never replaced by a
 * guess, so a 3D figure is never shown from partial data.
 */
export function pathLength3DMeters(
  points: Coordinate[],
  elevations: readonly (number | null)[],
): number | null {
  if (points.length < 2 || elevations.length !== points.length) return null
  if (elevations.some((e) => e === null || !Number.isFinite(e))) return null
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const horizontal = haversineMeters(points[i - 1], points[i])
    const dz = (elevations[i] as number) - (elevations[i - 1] as number)
    total += Math.hypot(horizontal, dz)
  }
  return total
}
