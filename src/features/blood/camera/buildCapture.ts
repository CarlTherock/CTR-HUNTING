import {
  computeCandidateMask,
  renderHighlight,
  type HighlightSettings,
} from './bloodHighlight'
import type { PendingCapture } from './useCameraClue'

/** Longest side kept for a captured photo (the preview is much smaller). */
export const CAPTURE_MAX_WIDTH = 1280

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9),
  )
}

/** Builds the original + highlighted photos from one frame. The WHOLE frame is
 * kept (not only the part visible after the screen's cover crop). The original
 * is never modified: the highlighted copy is drawn from the same pixels. */
export async function buildCapture(
  drawable: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  origin: PendingCapture['source'],
  settings: HighlightSettings,
): Promise<PendingCapture | null> {
  const scale = Math.min(1, CAPTURE_MAX_WIDTH / sourceWidth)
  const width = Math.round(sourceWidth * scale)
  const height = Math.round(sourceHeight * scale)
  const originalCanvas = document.createElement('canvas')
  originalCanvas.width = width
  originalCanvas.height = height
  const ctx = originalCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(drawable, 0, 0, width, height)
  const source = ctx.getImageData(0, 0, width, height)
  const candidates = computeCandidateMask(source, settings)
  const rendered = renderHighlight(source, candidates, settings)
  const processedCanvas = document.createElement('canvas')
  processedCanvas.width = width
  processedCanvas.height = height
  processedCanvas
    .getContext('2d')
    ?.putImageData(new ImageData(rendered, width, height), 0, 0)
  const [original, processed] = await Promise.all([
    canvasToBlob(originalCanvas),
    canvasToBlob(processedCanvas),
  ])
  if (!original || !processed) return null
  return {
    source: origin,
    original,
    processed,
    originalUrl: URL.createObjectURL(original),
    processedUrl: URL.createObjectURL(processed),
  }
}
