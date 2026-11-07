import type { Coordinate } from '@/types'

const EARTH_RADIUS_M = 6_371_008.8
const RAD = Math.PI / 180

export function haversineM(a: Coordinate, b: Coordinate): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Projection locale équirectangulaire autour d'un centre : suffisante pour quelques km. */
export function makeProjection(center: Coordinate) {
  const mPerLat = EARTH_RADIUS_M * RAD
  const mPerLng = mPerLat * Math.cos(center.lat * RAD)
  return {
    toMeters: (c: Coordinate) => ({
      x: (c.lng - center.lng) * mPerLng,
      y: (c.lat - center.lat) * mPerLat,
    }),
    toCoordinate: (x: number, y: number): Coordinate => ({
      lat: center.lat + y / mPerLat,
      lng: center.lng + x / mPerLng,
    }),
  }
}

/** Point dans un anneau (règle pair-impair) ; les coordonnées sont traitées comme planes. */
export function pointInRing(point: Coordinate, ring: readonly Coordinate[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
    ) {
      inside = !inside
    }
  }
  return inside
}

/** Polygone à trous : dans l'extérieur et hors de chaque trou. */
export function pointInPolygon(
  point: Coordinate,
  rings: readonly Coordinate[][],
): boolean {
  if (rings.length === 0 || !pointInRing(point, rings[0])) return false
  for (let i = 1; i < rings.length; i++) if (pointInRing(point, rings[i])) return false
  return true
}

export function bboxOf(rings: readonly Coordinate[][]) {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const ring of rings)
    for (const p of ring) {
      minLat = Math.min(minLat, p.lat)
      maxLat = Math.max(maxLat, p.lat)
      minLng = Math.min(minLng, p.lng)
      maxLng = Math.max(maxLng, p.lng)
    }
  return { minLat, maxLat, minLng, maxLng }
}
