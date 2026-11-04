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
import { SOFT_LEVELS } from './softTemplate'

/** Tile size actually produced (GeoMet sends 256 px; enlarged to keep detail). */
export const SOFT_TILE_SIZE = 512
const REQUEST_TIMEOUT_MS = 15_000

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

/** Enlarges and blurs a PNG tile; `null` when the browser cannot do it. */
export async function softenTile(
  png: ArrayBuffer,
  radius: number,
): Promise<ArrayBuffer | null> {
  if (typeof createImageBitmap === 'undefined') return null
  const canvas = createCanvas(SOFT_TILE_SIZE)
  const context = canvas?.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
  if (!canvas || !context) return null
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }))
  try {
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.clearRect(0, 0, SOFT_TILE_SIZE, SOFT_TILE_SIZE)
    context.drawImage(bitmap, 0, 0, SOFT_TILE_SIZE, SOFT_TILE_SIZE)
  } finally {
    bitmap.close?.()
  }
  const pixels = context.getImageData(0, 0, SOFT_TILE_SIZE, SOFT_TILE_SIZE)
  const smoothed = smoothRgba(pixels.data, SOFT_TILE_SIZE, SOFT_TILE_SIZE, radius)
  context.putImageData(new ImageData(smoothed, SOFT_TILE_SIZE, SOFT_TILE_SIZE), 0, 0)
  return canvasToPng(canvas)
}

const registered = new Set<string>()

function registerSoftProtocol(protocol: string, radius: number): void {
  if (registered.has(protocol)) return
  registered.add(protocol)
  addProtocol(protocol, async (params, abortController) => {
    const url = params.url.replace(`${protocol}://`, 'https://')
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS)
    const onAbort = () => timeout.abort()
    abortController.signal.addEventListener('abort', onAbort)
    try {
      const response = await fetch(url, { signal: timeout.signal })
      if (!response.ok) throw new Error(`GeoMet a répondu ${response.status}`)
      // GeoMet answers an out-of-range TIME with an XML error, not a PNG.
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('image')) throw new Error('GeoMet : image indisponible')
      const original = await response.arrayBuffer()
      try {
        const soft = await softenTile(original.slice(0), radius)
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

export function ensureSoftTileProtocolRegistered(): void {
  for (const { protocol, radius } of Object.values(SOFT_LEVELS)) {
    registerSoftProtocol(protocol, radius)
  }
}
