import { weatherLayerColor } from '@/utils/weatherMapColors'
import { pointOnCircle, wedgePath } from '@/utils/polarGeometry'

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
  { label: 'W', degrees: 270 },
]

/**
 * A radar/compass-style wind dial — visually in the spirit of HuntStand's
 * "Read the Wind" (concentric rings, a colored directional indicator),
 * but honestly scoped to what this app can back with real data: real
 * wind direction/speed only. HuntStand's actual ring colors model a
 * proprietary "scent impact" calculation this app has no way to verify
 * or reproduce — never fabricated here. Optimal-wind octants (a real,
 * user-saved preference, Phase 6) are shown as green wedges instead,
 * an honest "is the wind actually blowing from a direction I saved as
 * good for this spot" signal.
 */
export function WindCompass({ directionDegrees, speedKmh, optimalDirections, size = 140 }: WindCompassProps) {
  const center = size / 2
  const outerRadius = center - 16
  const color = weatherLayerColor('wind', speedKmh, 1)
  const arrowTip = pointOnCircle(center, center, outerRadius - 6, directionDegrees)
  const arrowLeft = pointOnCircle(center, center, outerRadius - 24, directionDegrees - 12)
  const arrowRight = pointOnCircle(center, center, outerRadius - 24, directionDegrees + 12)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Wind compass">
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
      <polygon
        points={`${arrowTip.x},${arrowTip.y} ${arrowLeft.x},${arrowLeft.y} ${center},${center} ${arrowRight.x},${arrowRight.y}`}
        fill={color}
      />
      <circle cx={center} cy={center} r={4} className="fill-ink-100" />
    </svg>
  )
}
