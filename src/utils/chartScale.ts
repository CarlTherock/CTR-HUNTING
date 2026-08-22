/** A minimal linear scale — maps a real data value in `[domainMin,
 * domainMax]` to a pixel position in `[rangeMin, rangeMax]`. Clamped, so
 * an out-of-range value degrades gracefully to the range's edge instead
 * of drawing off-chart. */
export function scaleLinear(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const domainSpan = domainMax - domainMin
  if (domainSpan === 0) return () => (rangeMin + rangeMax) / 2
  return (value: number) => {
    const t = Math.max(0, Math.min(1, (value - domainMin) / domainSpan))
    return rangeMin + t * (rangeMax - rangeMin)
  }
}

/** SVG `<path d="...">` for a polyline through real (x, y) pixel points —
 * `null` for fewer than 2 points, since a line needs at least two. */
export function buildLinePath(points: { x: number; y: number }[]): string | null {
  if (points.length < 2) return null
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
}
