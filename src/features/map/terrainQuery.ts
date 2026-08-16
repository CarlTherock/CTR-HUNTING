import { haversineMeters } from '@/utils/geo'
import { computeSlopeAspect } from '@/utils/terrain'
import type { Coordinate } from '@/types'
import type { SlopeAspect } from '@/utils/terrain'

const METERS_PER_DEGREE_LAT = 111_320

/** Samples elevation at 4 points around `coordinate` (N/S/E/W, offset by
 * `spacingMeters`) to compute a rough slope/aspect. Takes a plain
 * `queryElevation` function (not a `MapInstance`) so this stays a pure,
 * directly-testable function — `MapPage` supplies
 * `instanceRef.current!.queryElevation`. Returns `null` if any sample is
 * unavailable (e.g. that DEM tile hasn't loaded) rather than guessing. */
export function sampleSlopeAspect(
  queryElevation: (coordinate: Coordinate) => number | null,
  coordinate: Coordinate,
  spacingMeters = 15,
): SlopeAspect | null {
  const dLat = spacingMeters / METERS_PER_DEGREE_LAT
  const dLng = spacingMeters / (METERS_PER_DEGREE_LAT * Math.cos((coordinate.lat * Math.PI) / 180))

  const north = queryElevation({ lat: coordinate.lat + dLat, lng: coordinate.lng })
  const south = queryElevation({ lat: coordinate.lat - dLat, lng: coordinate.lng })
  const east = queryElevation({ lat: coordinate.lat, lng: coordinate.lng + dLng })
  const west = queryElevation({ lat: coordinate.lat, lng: coordinate.lng - dLng })

  if (north === null || south === null || east === null || west === null) return null
  return computeSlopeAspect(north, south, east, west, spacingMeters)
}

export interface ElevationProfilePoint {
  distanceMeters: number
  elevationMeters: number | null
}

/** Samples elevation along a (possibly multi-segment) path, roughly
 * evenly spaced by distance — real elevation lookups at real
 * interpolated positions along the path, not synthesized. Straight-line
 * (not great-circle) interpolation between vertices, which is accurate
 * enough at the short distances a hand-drawn hunting-trail profile
 * covers. */
export function sampleElevationProfile(
  queryElevation: (coordinate: Coordinate) => number | null,
  points: Coordinate[],
  sampleCount = 40,
): ElevationProfilePoint[] {
  if (points.length < 2) return []

  const segmentLengths = points.slice(1).map((p, i) => haversineMeters(points[i], p))
  const totalLength = segmentLengths.reduce((sum, d) => sum + d, 0)
  if (totalLength === 0) return []

  const result: ElevationProfilePoint[] = []
  for (let i = 0; i <= sampleCount; i++) {
    const targetDistance = (totalLength * i) / sampleCount
    const coordinate = pointAlongPath(points, segmentLengths, targetDistance)
    result.push({ distanceMeters: targetDistance, elevationMeters: queryElevation(coordinate) })
  }
  return result
}

function pointAlongPath(
  points: Coordinate[],
  segmentLengths: number[],
  targetDistance: number,
): Coordinate {
  let travelled = 0
  for (let i = 0; i < segmentLengths.length; i++) {
    const length = segmentLengths[i]
    if (targetDistance <= travelled + length || i === segmentLengths.length - 1) {
      const t = length === 0 ? 0 : Math.min(1, (targetDistance - travelled) / length)
      const a = points[i]
      const b = points[i + 1]
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
    }
    travelled += length
  }
  return points[points.length - 1]
}
