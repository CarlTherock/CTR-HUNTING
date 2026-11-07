import { useId, useState } from 'react'
import type { DayAnalysis, HourSlot } from '../engine'

const W = 720
const H = 276
const LEFT = 38
const RIGHT = 16
const TOP = 20
const BOTTOM = 38
const PW = W - LEFT - RIGHT
const PH = H - TOP - BOTTOM

export function chartDomain(slots: readonly HourSlot[]): { start: number; end: number } | null {
  if (!slots.length) return null
  const starts = slots.map((s) => Date.parse(s.startIso))
  const ends = slots.map((s) => Date.parse(s.endIso))
  if (starts.some((v) => !Number.isFinite(v)) || ends.some((v) => !Number.isFinite(v))) return null
  if (starts.some((v, i) => ends[i] <= v)) return null
  const start = Math.min(...starts)
  const end = Math.max(...ends)
  return end > start ? { start, end } : null
}

/** Courbes calculées, axe temporel réel, valeurs manquantes non reliées. */
export function HourlyChart({ day, timeZone }: { day: DayAnalysis; timeZone: string }) {
  const id = useId().replace(/:/g, '')
  const [picked, setPicked] = useState(0)
  const slots = day.slots
  const domain = chartDomain(slots)
  if (!domain) return <p role="status" className="text-ink-300 p-4 text-sm">Aucune série horaire exploitable pour cette journée.</p>
  const selectedIndex = Math.min(picked, slots.length - 1)
  const selected = slots[selectedIndex]
  const clock = (ms: number) => new Intl.DateTimeFormat('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(new Date(ms))
  const x = (ms: number) => LEFT + ((ms - domain.start) / (domain.end - domain.start)) * PW
  const y = (v: number) => TOP + PH * (1 - Math.max(0, Math.min(100, v)) / 100)
  const middle = (s: HourSlot) => (Date.parse(s.startIso) + Date.parse(s.endIso)) / 2
  const paths = (value: (s: HourSlot) => number | null) => {
    const lines: string[] = []
    let line = ''
    let previousEnd: number | null = null
    for (const s of slots) {
      const v = value(s)
      const start = Date.parse(s.startIso)
      if (previousEnd !== null && start > previousEnd && line) { lines.push(line); line = '' }
      if (v === null || !Number.isFinite(v)) {
        if (line) lines.push(line)
        line = ''
      } else line += `${line ? ' L' : 'M'}${x(middle(s)).toFixed(2)},${y(v).toFixed(2)}`
      previousEnd = Date.parse(s.endIso)
    }
    if (line) lines.push(line)
    return lines
  }
  const value = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : String(Math.round(v))
  const sun = [
    { at: day.sun.sunrise, label: 'Lever' },
    { at: day.sun.sunset, label: 'Coucher' },
  ]
  const series = [
    { label: 'Indice du créneau', color: '#4ade80', dash: undefined, read: (s: HourSlot) => s.index },
    { label: 'Référence journalière', color: '#c4cbdb', dash: '6 5', read: (s: HourSlot) => s.activity },
    { label: 'Conditions pratiques', color: '#38bdf8', dash: '2 5', read: (s: HourSlot) => s.conditions },
  ]
  return (
    <figure className="m-0 min-w-0" aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-title`} className="text-ink-100 text-base font-semibold">Votre journée, heure par heure</h2>
        <span className="text-ink-500 text-xs">Indices comparatifs · 0–100</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Indice horaire du ${day.dateKey}, heures du lieu ${timeZone}. Les créneaux sont surlignés.`} className="bg-surface-950 block w-full touch-pan-y rounded-xl" onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const px = ((e.clientX - r.left) / r.width) * W
        const at = domain.start + Math.max(0, Math.min(1, (px - LEFT) / PW)) * (domain.end - domain.start)
        let nearest = 0
        for (let i = 1; i < slots.length; i++) if (Math.abs(middle(slots[i]) - at) < Math.abs(middle(slots[nearest]) - at)) nearest = i
        setPicked(nearest)
      }}>
        <defs><clipPath id={`${id}-clip`}><rect x={LEFT} y={TOP} width={PW} height={PH} /></clipPath></defs>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={LEFT} x2={W - RIGHT} y1={y(v)} y2={y(v)} stroke="#29334a" strokeDasharray="3 5" /><text x={LEFT - 8} y={y(v) + 4} textAnchor="end" fill="#8b96b3" fontSize={11}>{v}</text></g>)}
        <g clipPath={`url(#${id}-clip)`}>
          {slots.filter((s) => !s.candidate).map((s) => <rect key={s.startIso} x={x(Date.parse(s.startIso))} y={TOP} width={x(Date.parse(s.endIso)) - x(Date.parse(s.startIso))} height={PH} fill="#1b2333" opacity={0.5} />)}
          {day.windows.map((w) => {
            const start = Math.max(domain.start, Date.parse(w.startIso), day.planningRange.start?.getTime() ?? domain.start)
            const end = Math.min(domain.end, Date.parse(w.endIso), day.planningRange.end?.getTime() ?? domain.end)
            return Number.isFinite(start) && Number.isFinite(end) && end > start ? <rect key={w.startIso} x={x(start)} y={TOP} width={x(end) - x(start)} height={PH} fill="#22c55e" opacity={0.14} /> : null
          })}
          {sun.map((m) => m.at && m.at.getTime() >= domain.start && m.at.getTime() <= domain.end ? <g key={m.label}><line x1={x(m.at.getTime())} x2={x(m.at.getTime())} y1={TOP} y2={TOP + PH} stroke="#fbbf24" strokeDasharray="5 5" /><title>{m.label} : {clock(m.at.getTime())}</title></g> : null)}
          {series.map((s) => <g key={s.label}>{paths(s.read).map((d, i) => <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={s.dash ? 2 : 3} strokeDasharray={s.dash} strokeLinecap="round" strokeLinejoin="round" />)}</g>)}
          <line x1={x(middle(selected))} x2={x(middle(selected))} y1={TOP} y2={TOP + PH} stroke="#f4f6fa" opacity={0.65} />
          {selected.index !== null && Number.isFinite(selected.index) && <circle cx={x(middle(selected))} cy={y(selected.index)} r={5} fill="#4ade80" stroke="#05070a" strokeWidth={2} />}
        </g>
        {Array.from({ length: 5 }, (_, i) => domain.start + ((domain.end - domain.start) * i) / 4).map((t, i) => <text key={i} x={x(t)} y={H - 13} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fill="#8b96b3" fontSize={12}>{clock(t)}</text>)}
      </svg>
      <label className="text-ink-300 mt-3 flex flex-col gap-2 text-xs">
        Explorer les heures
        <input type="range" min={0} max={slots.length - 1} step={1} value={selectedIndex} onChange={(e) => setPicked(Number(e.target.value))} aria-label="Heure sélectionnée" aria-valuetext={clock(middle(selected))} className="accent-brand-500 min-h-11 w-full" />
      </label>
      <div aria-live="polite" className="border-surface-700 bg-surface-800 grid grid-cols-2 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-4">
        <p className="text-ink-100 font-semibold tabular-nums">{clock(Date.parse(selected.startIso))}<span className="text-ink-500 block text-xs font-normal">Heure du lieu</span></p>
        <p className="text-brand-400 font-semibold tabular-nums">{value(selected.index)}<span className="text-ink-500 block text-xs font-normal">Indice du créneau</span></p>
        <p className="text-ink-300 tabular-nums">{value(selected.activity)}<span className="text-ink-500 block text-xs">Référence journalière</span></p>
        <p className="text-sky-300 tabular-nums">{value(selected.conditions)}<span className="text-ink-500 block text-xs">Conditions pratiques</span></p>
      </div>
      <figcaption className="text-ink-400 mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {series.map((s) => <span key={s.label}><span aria-hidden="true" style={{ color: s.color }}>{s.dash ? '┅' : '━'}</span> {s.label}</span>)}
        <span className="text-amber-300">Lever {day.sun.sunrise ? clock(day.sun.sunrise.getTime()) : '—'} · coucher {day.sun.sunset ? clock(day.sun.sunset.getTime()) : '—'}</span>
        <span>Fond vert : créneaux retenus. Une interruption de courbe indique une donnée manquante.</span>
        <span>Heures : {timeZone}. Référence schématique, pas une probabilité de rencontre.</span>
      </figcaption>
    </figure>
  )
}
