import { RESOURCE_CACHE_NAME } from './resourceCache'
import { TILE_CACHE_NAME } from './tileCache'

export interface ClearCachesResult {
  /** `false` when the Cache Storage API does not exist in this browser. */
  supported: boolean
  /** Caches that existed and were removed. */
  removed: string[]
}

/**
 * Removes the downloaded map tiles and the style/sprite/glyph resources kept
 * for offline use. The application's own files (service-worker precache) are
 * NOT touched: they are the program, not the user's data. Throws if the
 * browser refuses, so the caller can say so instead of claiming success.
 */
export async function clearOfflineCaches(): Promise<ClearCachesResult> {
  if (typeof caches === 'undefined') return { supported: false, removed: [] }
  const removed: string[] = []
  for (const name of [TILE_CACHE_NAME, RESOURCE_CACHE_NAME]) {
    if (await caches.delete(name)) removed.push(name)
  }
  return { supported: true, removed }
}
