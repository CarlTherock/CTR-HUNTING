/**
 * `object-fit: cover` shows the middle of the source and crops the rest. The
 * live video and the filtered canvas are drawn in boxes of the SAME size with
 * the SAME `object-fit: cover`, so they are cropped identically; this module
 * gives the exact relation between a source pixel and a displayed pixel, so it
 * can be checked rather than assumed.
 */
export interface CoverTransform {
  /** Displayed pixels per source pixel. */
  scale: number
  /** Where the source's (0, 0) lands in the box (≤ 0 on the cropped axis). */
  offsetX: number
  offsetY: number
}

export function coverTransform(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): CoverTransform {
  if (sourceWidth <= 0 || sourceHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 }
  }
  const scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight)
  return {
    scale,
    offsetX: (boxWidth - sourceWidth * scale) / 2,
    offsetY: (boxHeight - sourceHeight * scale) / 2,
  }
}

export function sourceToDisplay(
  transform: CoverTransform,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  }
}

export function displayToSource(
  transform: CoverTransform,
  point: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    y: (point.y - transform.offsetY) / transform.scale,
  }
}

/** Share of the source that stays visible on each axis (1 = nothing cropped). */
export function visibleShare(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): { x: number; y: number } {
  const t = coverTransform(sourceWidth, sourceHeight, boxWidth, boxHeight)
  return {
    x: Math.min(1, boxWidth / (sourceWidth * t.scale)),
    y: Math.min(1, boxHeight / (sourceHeight * t.scale)),
  }
}
