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
  /** Set to `moose` for an orignal observation made from « + Repère ». Absent
   * on every other entry; it never enters the DeerTracker statistics. */
  species?: 'moose'
  /** Present only on entries made in « Après le tir »: the user's own record of
   * a shot. Everything in it was typed or captured by the user. */
  shot?: ShotRecord
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
export type DeerEntryKind = 'sighting' | 'track' | 'rub' | 'scrape' | 'other_sign'

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

export type ShotSpecies = 'deer' | 'moose'

/** « Après le tir » — what the user records about a shot. `Observation.timestamp`
 * is the shot time and `Observation.coordinate` the shot position. Nothing here
 * is computed, inferred or predicted by the app: a position is either a GPS fix
 * or a point the user chose by hand, and is never presented as the animal's
 * real location. */
export interface ShotRecord {
  species: ShotSpecies
  /** What the user saw the animal do, in their own words. */
  reaction?: string
  /** Direction the animal was SEEN going (degrees clockwise from true north). */
  fleeDirectionDegrees?: number
  /** The user's own estimate of where the animal was, entered by hand. */
  estimatedAnimalPosition?: Coordinate
  /** The last place the user confirmed seeing the animal or a sure sign. */
  lastConfirmedPosition?: Coordinate
  /** Blood search (`BloodSession.id`) opened for this shot, if any. */
  searchSessionId?: string
  /** The point the user marked by hand on the anatomical drawing. It is the
   * user's presumed impact, not a finding. */
  impact?: ImpactEstimate
}

/** Views of the anatomical drawing. Only the left profile exists for now. */
export type AnatomyView = 'lateral-left'

/** « Anatomie » — where the user marked the presumed impact on a schematic
 * drawing. A 2D point says nothing about the path inside the animal, the
 * organs reached or the outcome: it is stored only so the user can come back
 * to it, edit it and share it with the shot record. */
export interface ImpactEstimate {
  /** Species of the drawing used (separate drawings for each species). */
  species: ShotSpecies
  view: AnatomyView
  /** Position on the illustration, 0..1 of its width (left → right). */
  x: number
  /** Position on the illustration, 0..1 of its height (top → bottom). */
  y: number
  /** Region of the drawing the point falls in (or that the user picked from
   * the list), when it falls in one. */
  regionId?: string
  /** Always true: the point is the user's presumption. */
  presumed: true
  /** When the point was saved. */
  recordedAt: string // ISO 8601
  /** Version of the drawing the coordinates refer to. */
  illustrationVersion: string
  /** The user's own note about the point. */
  note?: string
}
