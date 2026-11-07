import type { Coordinate } from '@/types'
import { pointInRing } from './geo'

const same = (a: Coordinate, b: Coordinate) => a.lat === b.lat && a.lng === b.lng
function validClosedRing(ring: readonly Coordinate[]): boolean {
  if (ring.length < 4 || !ring.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))) return false
  if (!same(ring[0], ring[ring.length - 1])) return false
  const origin = ring[0]
  let area = 0
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1]
    const b = ring[i]
    area += (a.lng - origin.lng) * (b.lat - origin.lat) - (b.lng - origin.lng) * (a.lat - origin.lat)
  }
  return Number.isFinite(area) && area !== 0
}
function orientation(a: Coordinate, b: Coordinate, c: Coordinate): number {
  const left = (b.lng - a.lng) * (c.lat - a.lat)
  const right = (b.lat - a.lat) * (c.lng - a.lng)
  const cross = left - right
  const tolerance = 32 * Number.EPSILON * (Math.abs(left) + Math.abs(right))
  return Math.abs(cross) <= tolerance ? 0 : Math.sign(cross)
}
function withinSegment(a: Coordinate, b: Coordinate, p: Coordinate): boolean {
  const tolerance = 32 * Number.EPSILON * Math.max(1, Math.abs(a.lat), Math.abs(a.lng), Math.abs(b.lat), Math.abs(b.lng), Math.abs(p.lat), Math.abs(p.lng))
  return p.lng >= Math.min(a.lng, b.lng) - tolerance && p.lng <= Math.max(a.lng, b.lng) + tolerance &&
    p.lat >= Math.min(a.lat, b.lat) - tolerance && p.lat <= Math.max(a.lat, b.lat) + tolerance
}
function intersects(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  return (abC * abD < 0 && cdA * cdB < 0) ||
    (abC === 0 && withinSegment(a, b, c)) || (abD === 0 && withinSegment(a, b, d)) ||
    (cdA === 0 && withinSegment(c, d, a)) || (cdB === 0 && withinSegment(c, d, b))
}

/**
 * Inclusion stricte locale : tous les sommets ET toutes les arêtes sont contenus.
 * Les contacts de limites sont écartés par prudence, sans réparation automatique.
 * Ce contrôle ne remplace pas une validation topologique générale des anneaux.
 */
export function ringStrictlyContainsRing(outer: readonly Coordinate[], inner: readonly Coordinate[]): boolean {
  if (!validClosedRing(outer) || !validClosedRing(inner)) return false
  if (!inner.slice(0, -1).every((p) => pointInRing(p, outer))) return false
  for (let i = 1; i < outer.length; i++)
    for (let j = 1; j < inner.length; j++)
      if (intersects(outer[i - 1], outer[i], inner[j - 1], inner[j])) return false
  return true
}
