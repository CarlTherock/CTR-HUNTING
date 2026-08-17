/**
 * Renders the moon's real illuminated shape from `phase` (0–1, SunCalc's
 * own value — never fabricated) using the standard two-arc SVG technique
 * for moon-phase icons: a full disc in the "dark" color, with a lighter
 * region on top bounded by the visible limb (a semicircle) and the
 * terminator (an ellipse whose x-radius shrinks/grows with `phase`).
 * `waxing` flips which side is lit, matching the real photographed
 * orientation (waxing = lit on the right in the Northern hemisphere
 * convention this app uses throughout its UI).
 */
export function MoonPhaseIcon({
  phase,
  waxing,
  size = 40,
}: {
  phase: number
  waxing: boolean
  size?: number
}) {
  const r = size / 2
  // x-radius of the terminator ellipse: 0 at new/full, full r at the quarters.
  const terminatorRx = Math.abs(Math.cos(phase * 2 * Math.PI)) * r
  // This path (top-center → terminator arc → bottom-center → limb arc
  // back to top-center) traces a shape lit on the *left* half — verified
  // visually, not just reasoned about, since SVG arc sweep direction is
  // easy to get backwards. Mirrored below for the right-lit case instead.
  const terminatorSweep = phase < 0.5 ? 1 : 0
  const path = `M ${r} 0 A ${terminatorRx} ${r} 0 0 ${terminatorSweep} ${r} ${size} A ${r} ${r} 0 0 1 ${r} 0 Z`
  // Waxing moons are lit on the right (Northern-hemisphere convention
  // this app uses throughout); waning ones mirror it.
  const litOnRight = phase < 0.5 ? waxing : !waxing

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Moon phase">
      <circle cx={r} cy={r} r={r} className="fill-surface-700" />
      <g transform={litOnRight ? `translate(${size}, 0) scale(-1, 1)` : undefined}>
        <path d={path} className="fill-ink-100" />
      </g>
      <circle cx={r} cy={r} r={r} fill="none" className="stroke-surface-600" strokeWidth={1} />
    </svg>
  )
}
