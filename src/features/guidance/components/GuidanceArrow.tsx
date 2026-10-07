export interface GuidanceArrowProps {
  /** Degrees clockwise from the top of the phone (unbounded, see above). */
  angleDegrees: number
  /** Text equivalent, e.g. "32° à droite". */
  description: string
  /** The numbers behind the arrow come from an old fix. */
  dimmed?: boolean
  size?: number
}

/** Arrow pointing at the destination relative to where the PHONE points: the
 * mark at the top of the ring is "straight ahead". Only rendered when a
 * reliable true-north phone heading exists. */
export function GuidanceArrow({
  angleDegrees,
  description,
  dimmed = false,
  size = 88,
}: GuidanceArrowProps) {
  return (
    <div
      role="img"
      aria-label={`Direction du point : ${description}`}
      data-testid="guidance-arrow"
      data-angle={Math.round(angleDegrees)}
      className={dimmed ? 'opacity-50' : undefined}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="2"
          className="text-ink-300"
        />
        {/* "Straight ahead" mark: fixed at the top of the phone. */}
        <rect x="47" y="2" width="6" height="10" rx="2" className="fill-ink-100" />
        <g
          data-testid="guidance-arrow-rotor"
          style={{
            transform: `rotate(${angleDegrees}deg)`,
            transformOrigin: '50px 50px',
          }}
          className="transition-transform duration-200 ease-out motion-reduce:transition-none"
        >
          <path
            d="M50 14 L68 58 L50 48 L32 58 Z"
            className="fill-brand-400 stroke-surface-950"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  )
}
