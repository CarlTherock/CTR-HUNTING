import type { Coordinate } from './geo'

/**
 * Field journal entry (Phase 13). Modeled now alongside the other domain
 * types since observations are referenced from waypoints/photos, but no
 * journal UI is built until its phase.
 */
export interface Observation {
  id: string
  coordinate: Coordinate
  timestamp: string // ISO 8601
  notes: string
  photoIds?: string[]
  waypointId?: string
  /** A real conditions snapshot at the time of the observation, taken
   * from whatever weather/wind data the app already had fetched (Phases
   * 5/6) — never fetched specifically for this, and never fabricated
   * when nothing was already loaded. */
  conditions?: {
    temperatureCelsius: number
    windSpeedKmh: number
    windDirectionDegrees: number
    cloudCoverPercent: number
  }
}
