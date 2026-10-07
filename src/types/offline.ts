import type { LngLatBounds } from '@/utils/tiles'
import type { MapBaseLayerId } from './map'

/**
 * Stored status of an area. `cancelled` is only found on records written by
 * older versions (new code writes `interrupted` instead); it stays in the
 * union so those records keep type-checking. Use `effectiveAreaStatus`
 * (features/offline/areaStatus.ts) for anything shown to the user.
 *
 *  - `complete`    every request of the sweep succeeded (see `deriveAreaStatus`)
 *  - `incomplete`  the sweep finished but with failures / timed-out steps
 *  - `interrupted` cancelled by the user, or the app died mid-download
 *  - `error`       the download could not run at all
 */
export type OfflineAreaStatus =
  'downloading' | 'complete' | 'incomplete' | 'interrupted' | 'cancelled' | 'error'

/** One failed request. `url` NEVER carries the query string (it holds API keys). */
export interface DownloadFailure {
  url: string
  /** Short reason: `timeout`, `réseau`, `HTTP 503`… */
  reason: string
}

/** Honest account of one download run (or the latest one, for a retried area). */
export interface DownloadSummary {
  /** Distinct tile URLs the engine asked for during the sweep. */
  requested: number
  /** Fetched from the network and cached during this run. */
  succeeded: number
  /** Already in the local cache — served without any network request. */
  reused: number
  /** Failed after all attempts (network, timeout, HTTP error). */
  failed: number
  /** Provider answered 404/204: no tile exists there. Not a failure. */
  absent: number
  /** Number of extra attempts made after a transient failure. */
  retried: number
  stepsTotal: number
  /** Sweep steps where the map reached `idle`. */
  stepsCompleted: number
  /** Sweep steps where the map never reached `idle`, even after a retry. */
  stepsTimedOut: number
  /** Capped list of failed requests (query string stripped). */
  failures: DownloadFailure[]
  /** Capped list of absent tiles (query string stripped). */
  absentUrls: string[]
  /** Style / sprite / glyph requests that failed during the download. */
  essentialFailures: DownloadFailure[]
}

/**
 * A user-selected map region downloaded for offline use (Phase 3).
 * `tileUrls` is kept so the area can be deleted precisely later —
 * without it, `offline/tileCache.ts` would have no way to know which
 * cached responses belong to this area versus another one (or to tiles
 * cached incidentally by ordinary browsing).
 */
export interface OfflineArea {
  id: string
  name: string
  bounds: LngLatBounds
  minZoom: number
  maxZoom: number
  baseLayer: MapBaseLayerId
  status: OfflineAreaStatus
  /** Real tile count computed from `bounds`/zoom range — known before any
   * download starts (pure tile math, not an estimate). */
  tileCount: number
  /** How many of `tileCount` tiles have actually been fetched+cached so
   * far — real progress, not simulated. */
  tilesDownloaded: number
  /** Sum of real `Content-Length`/blob sizes of tiles downloaded so far. */
  bytesDownloaded: number
  /** Tiles this area fetched itself (union over attempts). Used to delete
   * exactly its own tiles; tiles that were merely reused are not listed. */
  tileUrls: string[]
  createdAt: string // ISO 8601
  completedAt?: string // ISO 8601
  /** Result of the latest download run. Absent on records written before
   * download verification existed. */
  summary?: DownloadSummary
  /** How many download runs were started on this record. */
  attempts?: number
  lastAttemptAt?: string // ISO 8601
  /** Message of the exception when the status is `error`. */
  lastError?: string
}
