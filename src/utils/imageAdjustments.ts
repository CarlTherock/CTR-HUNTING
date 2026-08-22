export interface ImageAdjustments {
  brightnessPercent: number // 100 = unchanged
  contrastPercent: number // 100 = unchanged
  /** A named preset built from real, standard CSS `filter` functions —
   * never a fabricated effect. */
  filter: 'none' | 'grayscale' | 'sepia' | 'vivid'
}

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightnessPercent: 100,
  contrastPercent: 100,
  filter: 'none',
}

/** Builds a real Canvas2D `ctx.filter` string (the same standard CSS
 * `filter` syntax/functions used everywhere else on the web, applied to
 * a 2D canvas context per the Canvas spec) from real adjustment values —
 * never a custom/fabricated pixel-processing algorithm. */
export function buildCanvasFilter(adjustments: ImageAdjustments): string {
  const parts = [
    `brightness(${adjustments.brightnessPercent}%)`,
    `contrast(${adjustments.contrastPercent}%)`,
  ]
  if (adjustments.filter === 'grayscale') parts.push('grayscale(100%)')
  if (adjustments.filter === 'sepia') parts.push('sepia(100%)')
  if (adjustments.filter === 'vivid') parts.push('saturate(180%)')
  return parts.join(' ')
}
