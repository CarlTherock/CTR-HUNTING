import type { Locator, Page } from '@playwright/test'
import type { Rgb } from './png'

/**
 * The most frequent colour in a screenshot of `target`, computed inside
 * the browser (no image-decoding dependency). Used to assert the map
 * canvas really shows tiles: a blank or background-only canvas has a
 * different dominant colour than the mocked tile colour.
 */
export async function dominantColor(page: Page, target: Locator): Promise<Rgb> {
  const png = await target.screenshot({ type: 'png' })
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  return page.evaluate(async (src) => {
    const image = new Image()
    image.src = src
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas unavailable')
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const buckets = new Map<number, number>()
    for (let i = 0; i < data.length; i += 4 * 7) {
      // Quantise to 5 bits per channel so anti-aliasing noise still lands
      // in the same bucket.
      const key =
        (((data[i] ?? 0) >> 3) << 10) |
        (((data[i + 1] ?? 0) >> 3) << 5) |
        ((data[i + 2] ?? 0) >> 3)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    let best = 0
    let bestCount = -1
    for (const [key, count] of buckets) {
      if (count > bestCount) {
        best = key
        bestCount = count
      }
    }
    return [((best >> 10) & 31) << 3, ((best >> 5) & 31) << 3, (best & 31) << 3] as const
  }, dataUrl)
}

/** True when two colours are within `tolerance` per channel. */
export function colorsClose(a: Rgb, b: Rgb, tolerance = 12): boolean {
  return a.every((channel, index) => Math.abs(channel - (b[index] ?? -999)) <= tolerance)
}
