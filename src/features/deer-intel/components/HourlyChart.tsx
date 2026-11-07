import { useState } from 'react'
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
export function HourlyChart({ day, timeZone }: { day: DayAnalysis; timeZone: string }) {
  const [pick, setPick] = useState<number | null>(null)
  const slots = day.slots
  const hourAt = (d: Date | null) => {
    const first = slots[0]
    if (!d || !first) return null
    const x = (d.getTime() - Date.parse(first.startIso)) / 3_600_000
    return x >= 0 && x <= slots.length ? x : null
  }
  const sunX = [
    { x: hourAt(day.sun.sunrise), label: 'lever' },
    { x: hourAt(day.sun.sunset), label: 'coucher' },
  ]
  void timeZone
  const sel = pick === null ? null : (slots[pick] ?? null)
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
        className="border-surface-700 bg-surface-950 h-56 w-full touch-pan-y rounded-md border"
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = Math.floor(((e.clientX - r.left) / r.width) * slots.length)
          setPick(Math.min(slots.length - 1, Math.max(0, i)))
        }}
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
        {sunX.map((m) =>
          m.x === null ? null : (
            <line
              key={m.label}
              x1={m.x}
              x2={m.x}
              y1={0}
              y2={H}
              stroke="#fbbf24"
              strokeWidth={1.2}
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
        {pick !== null && (
          <rect x={pick} y={0} width={1} height={H} className="fill-ink-100/15" />
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
      <p aria-live="polite" className="text-ink-100 mt-2 min-h-10 text-sm tabular-nums">
        {sel
          ? `${sel.clock} · indice ${sel.index === null ? 'indisponible' : Math.round(sel.index)} · activité de référence ${sel.activity === null ? 'indisponible' : Math.round(sel.activity)} · conditions ${sel.conditions === null ? 'non évaluées' : Math.round(sel.conditions)}${sel.weather?.temperatureC != null ? ` · ${sel.weather.temperatureC.toFixed(1)} °C` : ''}`
          : 'Touchez une heure du graphique pour lire ses valeurs.'}
      </p>
      <figcaption className="text-ink-400 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          <span className="text-brand-400">━</span> indice du créneau
        </span>
        <span>
          <span className="text-ink-500">┅</span> activité de référence
        </span>
        <span>
          <span className="text-amber-400">┆</span> lever / coucher
        </span>
        <span>
          <span className="text-brand-400">▮</span> créneau retenu
        </span>
      </figcaption>
    </figure>
  )
}
