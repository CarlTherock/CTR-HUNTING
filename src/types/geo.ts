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
  | 'blood'
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
  /** Compass octants (0/45/90/…/315 — the direction wind is blowing
   * *from*) the hunter considers good wind for this spot, e.g. "wind
   * from the north or northeast keeps my scent off the trail I expect
   * deer to use." Matches onX Hunt's per-waypoint "Optimal Wind" concept
   * (verified via competitive research, see NOTES_TECHNIQUES_FUTURES.md).
   * Undefined/empty means "no preference set," not "any wind is bad." */
  optimalWindDirections?: number[]
  /** Logical folder (`Territory.id`). Absent means « Non classé ». */
  territoryId?: string
  /** Blood-search session this point belongs to (`BloodSession.id`). */
  sessionId?: string
  /** Kind of clue, for waypoints created from a blood-search session. */
  bloodKind?: BloodMarkerKind
  /** How the position was obtained: the phone's GPS or placed by hand. */
  origin?: 'gps' | 'manual'
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

/** Quick markers of a blood-search session. */
export type BloodMarkerKind =
  | 'blood'
  | 'shot_site'
  | 'last_seen'
  | 'blood_confirmed'
  | 'other_clue'
  | 'animal_found'
  | 'vehicle'

/** « normal » = ordinary trip with a user-chosen colour; « blood » = red path
 * of a blood-search session (the searcher's own movement, not the animal's). */
export type TrackKind = 'normal' | 'blood'

export interface Track {
  id: string
  name: string
  points: TrackPoint[]
  startedAt: string // ISO 8601
  endedAt?: string // ISO 8601
  distanceMeters?: number
  notes?: string
  /** Logical folder (`Territory.id`). Absent means « Non classé ». */
  territoryId?: string
  /** Absent on tracks recorded before this field existed = « normal ». */
  kind?: TrackKind
  /** Display colour (hex). Absent = default for the kind. Display only: it
   * never touches the recorded GPS points. */
  color?: string
  /** Blood-search session this track belongs to. */
  sessionId?: string
  /** Indexes in `points` that start a NEW segment (after a pause or an
   * unobserved interruption): no line is drawn from the previous point. */
  breaks?: number[]
}
