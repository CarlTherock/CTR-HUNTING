import type { BloodMarkerKind } from './geo'

/**
 * `waiting_gps`: started but no usable GPS fix yet — nothing is recorded and
 * the waiting time is not counted as movement.
 * `active` / `paused`: the searcher's own track is being recorded or not.
 * `finished`: closed, never deleted by finishing.
 */
export type BloodSessionStatus = 'waiting_gps' | 'active' | 'paused' | 'finished'

/** A blood-search (recovery) session: groups the searcher's red track and the
 * clues (waypoints) found on the way. The track is MY movement, never the
 * animal's path. */
export interface BloodSession {
  id: string
  name: string
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
  /** When the first usable GPS fix started the recording. */
  startedAt?: string
  endedAt?: string
  status: BloodSessionStatus
  species?: string
  /** Logical folder (`Territory.id`). */
  territoryId?: string
  /** Track recorded for this session (`Track.id`). */
  trackId?: string
  /** Highest number given per kind: it only goes up, so a deleted clue's
   * number is never reused or renumbered. */
  counters: Partial<Record<BloodMarkerKind, number>>
  notes?: string
}
