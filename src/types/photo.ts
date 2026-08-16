/** A photo attached to a waypoint. Stored as a real `Blob` in Dexie (not a
 * data URL string) — smaller on disk and avoids a base64 encode/decode
 * round-trip for something already binary. This is *not* Phase 12's
 * camera tool (live preview, zoom, filters) — slice 2.4 only lets a
 * hunter attach an existing photo (device camera or gallery) to a
 * waypoint via a plain file input. */
export interface Photo {
  id: string
  waypointId: string
  blob: Blob
  createdAt: string // ISO 8601
}
