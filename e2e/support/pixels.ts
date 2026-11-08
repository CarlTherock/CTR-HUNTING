import type { Locator, Page } from '@playwright/test'
import type { Rgb } from './png'
import { dominantPngColor } from './pngDecode'

/** Capture réelle du canevas ; décodage et histogramme côté Node, mêmes échantillons et quantification. */
export async function dominantColor(_page: Page, target: Locator): Promise<Rgb> {
  return dominantPngColor(await target.screenshot({ type: 'png' }))
}

/** True when two colours are within `tolerance` per channel. */
export function colorsClose(a: Rgb, b: Rgb, tolerance = 12): boolean {
  return a.every((channel, index) => Math.abs(channel - (b[index] ?? -999)) <= tolerance)
}

/** How many pixels of a screenshot of `target` are within `tolerance` per
 * channel of `color` (computed in the browser). Used to see that a thin
 * drawn line (e.g. the guidance line) really is on the canvas. */
export async function countPixelsNear(
  page: Page,
  target: Locator,
  color: Rgb,
  tolerance = 40,
): Promise<number> {
  const png = await target.screenshot({ type: 'png' })
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  return page.evaluate(
    async ({ src, rgb, tol }) => {
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
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        if (
          Math.abs((data[i] ?? 0) - (rgb[0] ?? 0)) <= tol &&
          Math.abs((data[i + 1] ?? 0) - (rgb[1] ?? 0)) <= tol &&
          Math.abs((data[i + 2] ?? 0) - (rgb[2] ?? 0)) <= tol
        ) {
          count++
        }
      }
      return count
    },
    { src: dataUrl, rgb: color, tol: tolerance },
  )
}

/** The colour of ONE screen pixel (CSS coordinates), read from a screenshot
 * of the page: what the user actually sees, controls included. */
export async function pixelAt(page: Page, x: number, y: number): Promise<Rgb> {
  const png = await page.screenshot({
    type: 'png',
    clip: { x: Math.floor(x), y: Math.floor(y), width: 2, height: 2 },
  })
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
    const { data } = context.getImageData(
      Math.floor(image.width / 2),
      Math.floor(image.height / 2),
      1,
      1,
    )
    return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0] as const
  }, dataUrl)
}
