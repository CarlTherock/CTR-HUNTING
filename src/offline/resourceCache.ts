/**
 * Cache Storage wrapper for the non-tile resources a MapLibre style needs
 * to draw anything: the style JSON, TileJSON, sprite sheet (JSON + image)
 * and glyph ranges. Without these a cold start offline shows an empty map
 * even when the tiles themselves are cached.
 *
 * Kept separate from the tile cache on purpose: tiles are deleted
 * per-offline-area, these small shared resources are not tied to any area
 * and are simply refreshed whenever the network answers.
 */
export const RESOURCE_CACHE_NAME = 'ctr-hunting-offline-resources'

async function openCache(): Promise<Cache> {
  return caches.open(RESOURCE_CACHE_NAME)
}

export async function getResource(url: string): Promise<Response | null> {
  const cache = await openCache()
  return (await cache.match(url)) ?? null
}

export async function putResource(url: string, response: Response): Promise<void> {
  const cache = await openCache()
  await cache.put(url, response)
}
