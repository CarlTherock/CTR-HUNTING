import {
  birdFlightDistanceMeters,
  isSelfIntersecting,
  pathLength3DMeters,
  polygonAreaSquareMeters,
  polygonPerimeterMeters,
  totalDistanceMeters,
} from '@/utils/geo'
import type { Coordinate } from '@/types'

export const ELEVATION_UNAVAILABLE = 'indisponible : élévation non chargée'
export const SELF_INTERSECTION_WARNING =
  'Polygone croisé : l’aire peut ne pas représenter la zone.'

export interface DistanceSummary {
  pointCount: number
  /** Sum of the geodesic segments. `null` below 2 points. */
  pathMeters: number | null
  /** First → last point, great circle. `null` below 2 points. */
  birdFlightMeters: number | null
  /** Only when EVERY point has a real elevation, else `null`. */
  length3DMeters: number | null
  /** How many points have no elevation (DEM tile not loaded / terrain off). */
  missingElevationCount: number
}

export function summarizeDistance(
  points: Coordinate[],
  queryElevation: (coordinate: Coordinate) => number | null,
): DistanceSummary {
  const enough = points.length >= 2
  const elevations = enough ? points.map((point) => queryElevation(point)) : []
  return {
    pointCount: points.length,
    pathMeters: enough ? totalDistanceMeters(points) : null,
    birdFlightMeters: enough ? birdFlightDistanceMeters(points) : null,
    length3DMeters: enough ? pathLength3DMeters(points, elevations) : null,
    missingElevationCount: elevations.filter((e) => e === null).length,
  }
}

export interface AreaSummary {
  pointCount: number
  /** `null` below 3 points. */
  areaSquareMeters: number | null
  perimeterMeters: number | null
  selfIntersecting: boolean
}

export function summarizeArea(points: Coordinate[]): AreaSummary {
  const enough = points.length >= 3
  return {
    pointCount: points.length,
    areaSquareMeters: enough ? polygonAreaSquareMeters(points) : null,
    perimeterMeters: enough ? polygonPerimeterMeters(points) : null,
    selfIntersecting: enough && isSelfIntersecting(points),
  }
}
