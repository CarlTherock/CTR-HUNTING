/**
 * « Rendu doux » of the weather rasters. `ctrsoft://` tiles are fetched from
 * GeoMet like any other, then enlarged 2× and blurred by about one source cell
 * (see `smoothing.ts`) before MapLibre draws them. Visual only: the data, the
 * colours of the legend and the value read at the map centre are unchanged.
 *
 * Never worse than the plain tile: if the browser cannot decode or draw the
 * image, the original bytes are returned as they came from GeoMet.
 */
import { addProtocol } from 'maplibre-gl'
import { smoothRgba } from './smoothing'
import { SOFT_BLUR_RADIUS, SOFT_TILE_PROTOCOL } from './softTemplate'

/** Tile size actually produced (GeoMet sends 256 px; enlarged to keep detail). */
export const SOFT_TILE_SIZE = 512
const REQUEST_TIMEOUT_MS = 15_000
/** Margin fetched around each tile, in source pixels (of 256). The blur then
 * sees the real neighbours at the tile edges, so no seam shows between tiles. */
export const SOFT_PAD_SRC = 32
const SRC_SIZE = 256

/** Same GetMap request widened by `SOFT_PAD_SRC` px on every side; `null` when
 * the URL carries no usable BBOX/WIDTH/HEIGHT (then the tile is fetched as is). */
export function paddedGetMapUrl(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  const box = (url.searchParams.get('BBOX') ?? '').split(',').map(Number)
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) return null
  const width = Number(url.searchParams.get('WIDTH'))
  const height = Number(url.searchParams.get('HEIGHT'))
  if (width !== SRC_SIZE || height !== SRC_SIZE) return null
  const [minX, minY, maxX, maxY] = box
  const padX = ((maxX - minX) / SRC_SIZE) * SOFT_PAD_SRC
  const padY = ((maxY - minY) / SRC_SIZE) * SOFT_PAD_SRC
  url.searchParams.set(
    'BBOX',
    [minX - padX, minY - padY, maxX + padX, maxY + padY].join(','),
  )
  url.searchParams.set('WIDTH', String(SRC_SIZE + 2 * SOFT_PAD_SRC))
  url.searchParams.set('HEIGHT', String(SRC_SIZE + 2 * SOFT_PAD_SRC))
  return url.toString()
}

function createCanvas(size: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    return canvas
  }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size)
  return null
}

async function canvasToPng(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<ArrayBuffer | null> {
  if ('convertToBlob' in canvas) return (await canvas.convertToBlob()).arrayBuffer()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
  return blob ? blob.arrayBuffer() : null
}

/**
 * Enlarges 2×, blurs, and returns the centre `SOFT_TILE_SIZE` px. A tile wider
 * than 256 px (the padded request) is cropped back to its centre; a plain
 * 256 px tile is simply enlarged. `null` when the browser cannot do it.
 */
export async function softenTile(
  png: ArrayBuffer,
  radius: number,
): Promise<ArrayBuffer | null> {
  if (typeof createImageBitmap === 'undefined') return null
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }))
  const full = bitmap.width * 2
  const work = createCanvas(full)
  const out = createCanvas(SOFT_TILE_SIZE)
  const ctx = work?.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
  const outCtx = out?.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
  if (!work || !out || !ctx || !outCtx) {
    bitmap.close?.()
    return null
  }
  try {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.clearRect(0, 0, full, full)
    ctx.drawImage(bitmap, 0, 0, full, full)
  } finally {
    bitmap.close?.()
  }
  const pixels = ctx.getImageData(0, 0, full, full)
  const smoothed = smoothRgba(pixels.data, full, full, radius)
  ctx.putImageData(new ImageData(smoothed, full, full), 0, 0)
  const margin = (full - SOFT_TILE_SIZE) / 2
  outCtx.clearRect(0, 0, SOFT_TILE_SIZE, SOFT_TILE_SIZE)
  outCtx.drawImage(
    work,
    margin,
    margin,
    SOFT_TILE_SIZE,
    SOFT_TILE_SIZE,
    0,
    0,
    SOFT_TILE_SIZE,
    SOFT_TILE_SIZE,
  )
  return canvasToPng(out)
}

/** Finished soft tiles, newest last. The radar loops over the same few frames;
 * without this every lap would fetch and blur every tile again. */
const SOFT_CACHE_MAX_BYTES = 40 * 1024 * 1024
const softCache = new Map<string, ArrayBuffer>()
let softCacheBytes = 0

function cacheGet(key: string): ArrayBuffer | undefined {
  const hit = softCache.get(key)
  if (!hit) return undefined
  softCache.delete(key)
  softCache.set(key, hit)
  return hit.slice(0)
}

function cacheSet(key: string, data: ArrayBuffer): void {
  const previous = softCache.get(key)
  if (previous) softCacheBytes -= previous.byteLength
  softCache.set(key, data.slice(0))
  softCacheBytes += data.byteLength
  for (const [oldest, value] of softCache) {
    if (softCacheBytes <= SOFT_CACHE_MAX_BYTES) break
    softCache.delete(oldest)
    softCacheBytes -= value.byteLength
  }
}

/** Test hook. */
export function clearSoftTileCache(): void {
  softCache.clear()
  softCacheBytes = 0
}

let registered = false

export function ensureSoftTileProtocolRegistered(): void {
  if (registered) return
  registered = true
  addProtocol(SOFT_TILE_PROTOCOL, async (params, abortController) => {
    const url = params.url.replace(`${SOFT_TILE_PROTOCOL}://`, 'https://')
    const cached = cacheGet(url)
    if (cached) return { data: cached }
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
    const onAbort = () => timeout.abort()
    abortController.signal.addEventListener('abort', onAbort)
    try {
      const fetchTile = async (target: string): Promise<ArrayBuffer> => {
        const response = await fetch(target, { signal: timeout.signal })
        if (!response.ok) throw new Error(`GeoMet a répondu ${response.status}`)
        // GeoMet answers an out-of-range TIME with an XML error, not a PNG.
        const type = response.headers.get('content-type') ?? ''
        if (!type.includes('image')) throw new Error('GeoMet : image indisponible')
        return response.arrayBuffer()
      }
      const padded = paddedGetMapUrl(url)
      if (padded) {
        try {
          const soft = await softenTile(await fetchTile(padded), SOFT_BLUR_RADIUS)
          if (soft) {
            cacheSet(url, soft)
            return { data: soft }
          }
        } catch (error) {
          if (timeout.signal.aborted) throw error
        }
      }
      // Plain tile: the padded request failed, or the URL could not be padded.
      const original = await fetchTile(url)
      try {
        const soft = await softenTile(original.slice(0), SOFT_BLUR_RADIUS)
        if (soft) cacheSet(url, soft)
        return { data: soft ?? original }
      } catch {
        return { data: original }
      }
    } finally {
      clearTimeout(timer)
      abortController.signal.removeEventListener('abort', onAbort)
    }
  })
}
