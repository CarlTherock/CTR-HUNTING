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

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
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
