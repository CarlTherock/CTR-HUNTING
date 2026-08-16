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

/** Hunting-specific waypoint categories — each renders with its own icon
 * on the map (`src/services/map/MapLibreProvider.ts`), matching the
 * granularity of the reference apps (onX Hunt, HuntStand): a "stand" and
 * a "trail camera" are different things a hunter marks, not both dumped
 * into one generic pin. */
export type WaypointCategory =
  | 'general'
  | 'stand_blind'
  | 'trail_camera'
  | 'food_plot'
  | 'water'
  | 'bedding_area'
  | 'game_sign'
  | 'kill_site'
  | 'trailhead'
  | 'parking'
  | 'campsite'
  | 'hazard'
  | 'gate'
  | 'custom'

/** Preset marker colors — a fixed palette (not a free-form color picker)
 * so every waypoint stays visually consistent and legible against the
 * map, the way the reference apps' waypoint colors work. */
export type WaypointColor =
  | '#f59e0b' // amber (default)
  | '#ef4444' // red
  | '#3b82f6' // blue
  | '#22c55e' // green
  | '#a855f7' // purple
  | '#eab308' // yellow
  | '#ec4899' // pink
  | '#64748b' // slate

export interface Waypoint {
  id: string
  name: string
  coordinate: Coordinate
  category: WaypointCategory
  /** Defaults to amber (`#f59e0b`) when unset — see
   * `DEFAULT_WAYPOINT_COLOR` in `MapLibreProvider.ts`. */
  color?: WaypointColor
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
