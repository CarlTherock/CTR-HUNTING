/** A geographic position. Altitude/accuracy are optional since not every
 * source (e.g. a manually placed waypoint) provides them. */
export interface Coordinate {
  lat: number
  lng: number
  /** Meters above sea level, when known. */
  altitude?: number
  /** GPS horizontal accuracy radius in meters, when known. */
  accuracyMeters?: number
}

/** A single sample in a recorded GPS track. */
export interface TrackPoint extends Coordinate {
  timestamp: string // ISO 8601
}

export type WaypointCategory =
  | 'general'
  | 'campsite'
  | 'water'
  | 'game_sign'
  | 'stand_blind'
  | 'trailhead'
  | 'hazard'
  | 'vehicle'
  | 'custom'

export interface Waypoint {
  id: string
  name: string
  coordinate: Coordinate
  category: WaypointCategory
  notes?: string
  photoIds?: string[]
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

export interface Track {
  id: string
  name: string
  points: TrackPoint[]
  startedAt: string // ISO 8601
  endedAt?: string // ISO 8601
  distanceMeters?: number
  notes?: string
}
