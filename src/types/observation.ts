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
  /** Logical folder (`Territory.id`). Absent means « Non classé ». */
  territoryId?: string
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
  /** When the entry was typed in. `timestamp` is when it was OBSERVED, which
   * can be earlier (a sighting recorded later). Absent on older entries. */
  createdAt?: string // ISO 8601
  /** Where the position comes from; absent on older entries (GPS or the map
   * centre, as the journal always worked). */
  positionOrigin?: PositionOrigin
  /** Where/when the `conditions` values were read (provider, fetch time,
   * cached or fresh). Absent when no conditions were attached. */
  conditionsMeta?: ConditionsMeta
  /** Present only on entries classified in DeerTracker (the user's own record
   * of a deer sighting or sign). Entries without it are ordinary journal
   * entries and are never reclassified automatically. */
  deer?: DeerEntry
  /** Trace (`Track.id`) the entry was made during, if the user linked one. */
  trackId?: string
}

export type PositionOrigin = 'gps' | 'manual'

export interface ConditionsMeta {
  source: string
  /** When the weather data was fetched. */
  fetchedAt: string // ISO 8601
  /** True when it was the last saved forecast, not a fresh request. */
  cached: boolean
}

/** What the user saw. */
export type DeerEntryKind =
  | 'sighting'
  | 'track'
  | 'rub'
  | 'scrape'
  | 'other_sign'

export type DeerSex = 'male' | 'female'
export type DeerAgeClass = 'fawn' | 'young' | 'adult'

/** The user's own record. Every detail is optional and is only what the user
 * entered: nothing here is inferred, identified or predicted. */
export interface DeerEntry {
  kind: DeerEntryKind
  /** Number of animals seen, when counted. */
  count?: number
  sex?: DeerSex
  ageClass?: DeerAgeClass
  /** Direction of travel the user actually observed, degrees clockwise from
   * true north (the way the animal was going, not where the wind comes from). */
  travelDirectionDegrees?: number
  /** A name the user chose. Never an automatic identification. */
  name?: string
  /** The user's own annotation, e.g. « possiblement le même animal que… ».
   * It is a note, not a conclusion drawn by the app. */
  sameAnimalNote?: string
}
