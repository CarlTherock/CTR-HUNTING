import type { DayAnalysis, HourSlot } from '../engine'

const W = 24
const H = 100

function segments(
  slots: readonly HourSlot[],
  value: (s: HourSlot) => number | null,
): string[] {
  const out: string[] = []
  let current = ''
  slots.forEach((s, i) => {
    const v = value(s)
    if (v === null) {
      if (current) out.push(current)
      current = ''
      return
    }
    const x = i + 0.5
    const y = H - v
    current += `${current ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)} `
  })
  if (current) out.push(current)
  return out
}

/** Graphique horaire calculé (SVG) : échelle fixe 0–100 pour tous les jours, trous visibles. */
export function HourlyChart({ day }: { day: DayAnalysis }) {
  const slots = day.slots
  const indexSegs = segments(slots, (s) => s.index)
  const activitySegs = segments(slots, (s) => s.activity)
  const summary = day.windows.length
    ? `Meilleurs créneaux : ${day.windows.map((w) => `${w.startClock}–${w.endClock}`).join(', ')}.`
    : 'Aucun créneau au-dessus du seuil.'
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Indice horaire du ${day.dateKey}, échelle 0 à 100. ${summary}`}
        className="border-surface-700 bg-surface-950 h-40 w-full rounded-md border"
      >
        {[25, 50, 75].map((v) => (
          <line
            key={v}
            x1={0}
            x2={W}
            y1={H - v}
            y2={H - v}
            stroke="currentColor"
            className="text-surface-700"
            strokeWidth={0.15}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {day.windows.map((w) => {
          const start = slots.findIndex((s) => s.startIso === w.startIso)
          if (start < 0) return null
          return (
            <rect
              key={w.startIso}
              x={start}
              y={0}
              width={w.hours}
              height={H}
              className="fill-brand-500/20"
            />
          )
        })}
        {slots.map((s, i) =>
          s.candidate ? null : (
            <rect
              key={s.startIso}
              x={i}
              y={0}
              width={1}
              height={H}
              className="fill-surface-800/60"
            />
          ),
        )}
        {activitySegs.map((d) => (
          <path
            key={`a${d}`}
            d={d}
            fill="none"
            stroke="currentColor"
            className="text-ink-500"
            strokeDasharray="0.5 0.4"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {indexSegs.map((d) => (
          <path
            key={`i${d}`}
            d={d}
            fill="none"
            stroke="currentColor"
            className="text-brand-400"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="text-ink-600 mt-1 flex justify-between text-[11px] tabular-nums">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{String(h % 24).padStart(2, '0')}h</span>
        ))}
      </div>
      <figcaption className="text-ink-500 mt-1 text-xs">
        Trait plein : indice du créneau (0–100, même échelle tous les jours). Pointillé :
        activité de référence. Zone verte : créneau retenu. Zone sombre : hors plage de
        planification ou de disponibilité. Un trou = donnée absente (jamais 0).
      </figcaption>
    </figure>
  )
}
