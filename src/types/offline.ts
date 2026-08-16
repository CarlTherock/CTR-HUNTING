import type { LngLatBounds } from '@/utils/tiles'
import type { MapBaseLayerId } from './map'

export type OfflineAreaStatus = 'downloading' | 'complete' | 'cancelled' | 'error'

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
  tileUrls: string[]
  createdAt: string // ISO 8601
  completedAt?: string // ISO 8601
}
