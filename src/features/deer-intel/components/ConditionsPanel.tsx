import { useId } from 'react'
import type { DayAnalysis, HourSlot } from '../engine'
import { chartDomain } from './hourlyChartDomain'

const metrics = [
  { label: 'Température', unit: '°C', color: '#fb923c', zero: false, read: (s: HourSlot) => s.weather?.temperatureC ?? null },
  { label: 'Pression de surface', unit: 'hPa', color: '#38bdf8', zero: false, read: (s: HourSlot) => s.weather?.surfacePressureHpa ?? null },
  { label: 'Vent moyen', unit: 'km/h', color: '#a3e635', zero: true, read: (s: HourSlot) => s.weather?.windSpeedKmh ?? null },
  { label: 'Pluie par heure', unit: 'mm', color: '#a5b4fc', zero: true, read: (s: HourSlot) => s.weather?.precipitationMm ?? null },
]
/** Axes en unités physiques ; les trous de prévision ne sont jamais reliés. */
export function ConditionsPanel({ day, timeZone }: { day: DayAnalysis; timeZone: string }) {
  const id = useId()
  const domain = chartDomain(day.slots)
  const clock = (at: Date | null) => at && Number.isFinite(at.getTime())
    ? new Intl.DateTimeFormat('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(at) : '—'
  return <section aria-labelledby={`${id}-title`} className="border-surface-700 bg-surface-900 space-y-4 rounded-xl border p-3">
    <header><h2 id={`${id}-title`} className="text-ink-100 text-base font-semibold">Conditions, soleil et lune</h2><p className="text-ink-400 mt-1 text-xs">Heures du lieu : {timeZone}. Prévisions et astronomie, distinctes de l’indice comparatif.</p></header>
    <div className="grid gap-4 sm:grid-cols-2">{metrics.map((m) => {
      const values = day.slots.map(m.read).filter((v): v is number => v !== null && Number.isFinite(v))
      if (!domain || values.length === 0) return <div key={m.label} className="bg-surface-950 rounded-lg p-3"><h3 className="text-ink-200 text-sm font-medium">{m.label}</h3><p role="status" className="text-ink-400 mt-2 text-xs">Prévision indisponible — aucune valeur remplacée par zéro.</p></div>
      const min = Math.min(...values), max = Math.max(...values)
      const pad = Math.max((max - min) * 0.1, m.unit === 'hPa' ? 1 : 0.5)
      const lo = m.zero ? 0 : min - pad, hi = max + pad
      const x = (t: number) => 56 + (t - domain.start) / (domain.end - domain.start) * 288
      const y = (v: number) => 18 + (hi - v) / (hi - lo) * 122
      const paths: string[] = []
      let line = '', previousEnd: number | null = null
      for (const s of day.slots) {
        const v = m.read(s), start = Date.parse(s.startIso), end = Date.parse(s.endIso)
        if (v === null || !Number.isFinite(v) || (previousEnd !== null && start > previousEnd)) { if (line) paths.push(line); line = '' }
        if (v !== null && Number.isFinite(v)) line += `${line ? ' L' : 'M'}${x((start + end) / 2)},${y(v)}`
        previousEnd = end
      }
      if (line) paths.push(line)
      return <figure key={m.label} className="min-w-0"><figcaption className="text-ink-200 mb-2 flex justify-between gap-2 text-sm"><span>{m.label}</span><span className="text-ink-400 text-xs">{m.unit}</span></figcaption>
        <svg viewBox="0 0 360 182" role="img" aria-label={`${m.label} en ${m.unit}, heures locales, données manquantes interrompues`} className="bg-surface-950 block w-full rounded-lg">
          {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={56} x2={344} y1={y(v)} y2={y(v)} stroke="#29334a" strokeDasharray="3 4"/><text x={49} y={y(v) + 4} textAnchor="end" fill="#cbd5e1" fontSize={11}>{v.toFixed(m.unit === 'hPa' ? 0 : 1)}</text></g>)}
          {paths.map((d, i) => <path key={i} d={d} fill="none" stroke={m.color} strokeWidth={2.5}/>)}
          {day.slots.map((s) => { const v = m.read(s); return v !== null && Number.isFinite(v) ? <circle key={s.startIso} cx={x((Date.parse(s.startIso) + Date.parse(s.endIso)) / 2)} cy={y(v)} r={2} fill={m.color}><title>{s.clock} : {v} {m.unit}</title></circle> : null })}
          {[0, 1, 2, 3, 4].map((i) => { const t = domain.start + (domain.end - domain.start) * i / 4; return <text key={i} x={x(t)} y={164} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fill="#cbd5e1" fontSize={11}>{clock(new Date(t))}</text> })}
        </svg><p className="text-ink-400 mt-1 text-xs">Valeurs disponibles : {min.toFixed(1)} à {max.toFixed(1)} {m.unit}.</p>
      </figure>
    })}</div>
    <div className="border-surface-700 border-t pt-3"><h3 className="text-ink-100 text-sm font-semibold">Soleil et lune</h3><dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      {[['Lever du soleil', clock(day.sun.sunrise)], ['Coucher du soleil', clock(day.sun.sunset)], ['Aube', clock(day.sun.dawn)], ['Crépuscule', clock(day.sun.dusk)], ['Phase lunaire', day.moon.phaseName], ['Fraction éclairée à midi', Number.isFinite(day.moon.illuminationFraction) ? `${Math.round(day.moon.illuminationFraction * 100)} %` : '—'], ['Lever de lune', clock(day.moon.rise)], ['Coucher de lune', clock(day.moon.set)], ['Transit supérieur', clock(day.moon.upperTransit)], ['Transit inférieur', clock(day.moon.lowerTransit)]].map(([label, value]) => <div key={label}><dt className="text-ink-400 text-xs">{label}</dt><dd className="text-ink-100 mt-1 tabular-nums">{value}</dd></div>)}
    </dl><p className="text-ink-400 mt-3 text-xs">L’éclairement lunaire n’est pas la lumière réellement disponible au sol. Pression et température restent du contexte ; l’hypothèse solunaire conserve le réglage choisi, sans bonus ajouté ici. Les horaires solaires ne sont pas les heures légales de chasse.</p></div>
  </section>
}
