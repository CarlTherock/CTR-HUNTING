/** A point on a circle of `radius` at `angleDegrees` clockwise from
 * north (0° = straight up, matching compass bearing convention), around
 * `(cx, cy)`. Shared by anything drawing a compass/radar-style dial. */
export function pointOnCircle(
  cx: number,
  cy: number,
  radius: number,
  angleDegrees: number,
): { x: number; y: number } {
  const rad = ((angleDegrees - 90) * Math.PI) / 180
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
}

/** SVG path for a filled wedge (pie slice) spanning `startDegrees` to
 * `endDegrees` (compass bearing, clockwise from north) at `radius`
 * around `(cx, cy)` — used to highlight a real compass octant (e.g. a
 * saved "optimal wind" direction) on a radial dial. */
export function wedgePath(
  cx: number,
  cy: number,
  radius: number,
  startDegrees: number,
  endDegrees: number,
): string {
  const start = pointOnCircle(cx, cy, radius, startDegrees)
  const end = pointOnCircle(cx, cy, radius, endDegrees)
  const span = ((endDegrees - startDegrees) % 360 + 360) % 360
  const largeArc = span > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}
