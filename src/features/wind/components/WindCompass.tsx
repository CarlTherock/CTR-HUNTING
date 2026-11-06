import { weatherLayerColor } from '@/utils/weatherMapColors'
import { pointOnCircle, wedgePath } from '@/utils/polarGeometry'
import { scentZone, windFlowDegrees } from '@/utils/windScent'

export interface WindCompassProps {
  directionDegrees: number
  speedKmh: number
  /** Real saved "optimal wind" octants (Phase 6's per-waypoint feature),
   * when viewing a specific waypoint — highlighted in green on the
   * dial. Omitted entirely when there's no waypoint context. */
  optimalDirections?: number[]
  size?: number
}

const CARDINALS = [
  { label: 'N', degrees: 0 },
  { label: 'E', degrees: 90 },
  { label: 'S', degrees: 180 },
  { label: 'O', degrees: 270 },
]

/**
 * A compass-style wind dial in the spirit of HuntStand's "Read the Wind":
 * an arrow that points where the wind is GOING (wind from the south → the
 * arrow points north), and a red zone centred on the arrow tip covering three
 * compass points (toward N → NW–N–NE): the side the hunter's scent is carried
 * to (danger of being detected by game). The zone follows the real wind; it is
 * a fixed-width cone, not a computed scent model. Optimal-wind octants
 * (a real, user-saved preference) are green wedges.
 */
export function WindCompass({
  directionDegrees,
  speedKmh,
  optimalDirections,
  size = 140,
}: WindCompassProps) {
  const center = size / 2
  const outerRadius = center - 16
  const color = weatherLayerColor('wind', speedKmh, 1)
  const flow = windFlowDegrees(directionDegrees)
  const zone = scentZone(directionDegrees)
  const arrowColor = color
  const tail = pointOnCircle(center, center, outerRadius * 0.5, flow + 180)
  const neck = pointOnCircle(center, center, outerRadius - 16, flow)
  const tip = pointOnCircle(center, center, outerRadius - 2, flow)
  const headLeft = pointOnCircle(center, center, outerRadius - 18, flow - 14)
  const headRight = pointOnCircle(center, center, outerRadius - 18, flow + 14)

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Boussole du vent"
      data-flow-degrees={Math.round(flow)}
    >
      <path
        d={wedgePath(center, center, outerRadius, zone.start, zone.end)}
        className="fill-status-danger/30"
        data-testid="scent-danger-zone"
      />
      {optimalDirections?.map((octant) => (
        <path
          key={octant}
          d={wedgePath(center, center, outerRadius, octant - 22.5, octant + 22.5)}
          className="fill-status-success/20"
        />
      ))}
      {[1, 0.72, 0.44].map((ratio) => (
        <circle
          key={ratio}
          cx={center}
          cy={center}
          r={outerRadius * ratio}
          fill="none"
          className="stroke-surface-600"
          strokeWidth={1}
        />
      ))}
      {CARDINALS.map(({ label, degrees }) => {
        const p = pointOnCircle(center, center, outerRadius + 12, degrees)
        return (
          <text
            key={label}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-ink-500 text-[10px] font-semibold"
          >
            {label}
          </text>
        )
      })}
      <line
        x1={tail.x}
        y1={tail.y}
        x2={neck.x}
        y2={neck.y}
        stroke={arrowColor}
        strokeWidth={4}
        strokeLinecap="round"
        data-testid="wind-arrow"
      />
      <polygon
        points={`${tip.x},${tip.y} ${headLeft.x},${headLeft.y} ${headRight.x},${headRight.y}`}
        fill={arrowColor}
      />
      <circle cx={center} cy={center} r={4} className="fill-ink-100" />
    </svg>
  )
}
