/**
 * Wraps the browser's Cache Storage API for map tile bytes.
 *
 * Tiles are binary and can be large in aggregate (a downloaded area can
 * be hundreds of tiles) — Cache Storage is the right tool for that (it's
 * built for storing real `Request`/`Response` pairs), unlike Dexie/
 * IndexedDB, which the rest of this app uses for small structured
 * records (waypoints, tracks, offline-area *metadata*). Only this file
 * touches the `caches` global — everything else goes through these
 * functions, matching the project's "external capability behind an
 * adapter" pattern.
 */
const CACHE_NAME = 'ctr-hunting-offline-tiles'

async function openCache(): Promise<Cache> {
  return caches.open(CACHE_NAME)
}

/** `true` if this exact tile URL is already cached — used to skip
 * re-downloading a tile a previous (possibly interrupted) download
 * already fetched. */
export async function hasTile(url: string): Promise<boolean> {
  const cache = await openCache()
  const match = await cache.match(url)
  return match !== undefined
}

/** Returns the cached response for `url`, or `null` if not cached. */
export async function getTile(url: string): Promise<Response | null> {
  const cache = await openCache()
  const match = await cache.match(url)
  return match ?? null
}

/** Stores an already-fetched response under `url`. Exposed separately
 * from `fetchAndCacheTile` for callers (the MapLibre protocol handler)
 * that fetch the response themselves and need the bytes for another
 * purpose (returning them to MapLibre) too. */
export async function putTile(url: string, response: Response): Promise<void> {
  const cache = await openCache()
  await cache.put(url, response)
}

/** Fetches `url` over the network and stores the response, returning its
 * real byte size (`Response.clone().blob().size` — not estimated). */
export async function fetchAndCacheTile(url: string): Promise<number> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Tile request failed (${response.status}): ${url}`)
  }
  const blob = await response.clone().blob()
  await putTile(url, response)
  return blob.size
}

/** Removes exactly the given tile URLs from the cache — used when
 * deleting an offline area, so only that area's tiles are removed, not
 * everything (another area's tiles may share the cache). */
export async function deleteTiles(urls: string[]): Promise<void> {
  const cache = await openCache()
  await Promise.all(urls.map((url) => cache.delete(url)))
}

/** Real, browser-reported storage usage/quota
 * (`navigator.storage.estimate()`) — `null` if the API isn't available
 * (older Safari). Never estimated/guessed client-side. */
export async function estimateStorageUsage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const { usage, quota } = await navigator.storage.estimate()
  if (usage === undefined || quota === undefined) return null
  return { usage, quota }
}
