import type { Coordinate } from '@/types'

/** True when `lat`/`lng` are finite numbers inside the valid WGS84 range.
 * MapLibre's `LngLat` constructor throws on NaN/out-of-range values, so any
 * coordinate coming from outside (GPS fix, imported waypoint, persisted
 * data) is checked here before it reaches the engine — an invalid one is
 * skipped, never replaced with a guessed position. */
export function isValidCoordinate(c: Coordinate | null | undefined): c is Coordinate {
  return (
    !!c &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180
  )
}
