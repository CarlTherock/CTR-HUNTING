import type { Coordinate } from './geo'

/** A photo attached to a waypoint. Stored as a real `Blob` in Dexie (not a
 * data URL string) — smaller on disk and avoids a base64 encode/decode
 * round-trip for something already binary.
 *
 * Slice 2.4's plain file input (device camera app or gallery) and
 * Phase 12's live in-app camera tool (`features/camera/`) both write
 * through this same repository — `originalBlob` and `coordinate` are
 * `undefined`/equal-to-`blob` for the former (a picked file has no
 * capture-time GPS, and there's no separate "original" to keep since no
 * in-app editing happened to it). */
export interface Photo {
  id: string
  /** A photo belongs to exactly one of these — never both, never
   * neither. */
  waypointId?: string
  observationId?: string
  /** The version shown/exported — identical to `originalBlob` unless the
   * camera tool's brightness/contrast/filter adjustments were applied. */
  blob: Blob
  /** The untouched raw capture — Phase 12's "original image always
   * kept" rule. Equal to `blob` for photos that were never edited. */
  originalBlob: Blob
  /** Real GPS position at capture time, when available — never
   * fabricated; absent for gallery-picked photos, which have no
   * capture-time location. */
  coordinate?: Coordinate
  createdAt: string // ISO 8601
}
