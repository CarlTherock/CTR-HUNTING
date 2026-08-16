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
}
