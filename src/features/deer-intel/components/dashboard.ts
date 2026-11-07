import type { DayAnalysis, HourSlot, HuntWindow } from '../engine'
import { COMPASS_8 } from './format'

export type SlotStatus = 'a_venir' | 'en_cours' | 'passe'

export interface BestSlot {
  main: HuntWindow
  status: SlotStatus
  /** Meilleur créneau du jour déjà passé, quand le principal est « restant ». */
  earlierBest: HuntWindow | null
  alternative: HuntWindow | null
}

const ms = (iso: string) => Date.parse(iso)

/**
 * Meilleur créneau à afficher. Pour aujourd'hui (`nowMs` dans la journée), on distingue le meilleur
 * créneau RESTANT d'un créneau déjà passé ; un autre jour : le premier du classement.
 */
export function pickBestSlot(day: DayAnalysis, nowMs: number): BestSlot | null {
  const all = day.windows
  const best = all[0]
  if (!best) return null
  const first = day.slots[0]
  const last = day.slots[day.slots.length - 1]
  const isToday =
    first !== undefined &&
    last !== undefined &&
    nowMs >= ms(first.startIso) &&
    nowMs < ms(last.endIso)
  if (!isToday) {
    return {
      main: best,
      status: 'a_venir',
      earlierBest: null,
      alternative: all[1] ?? null,
    }
  }
  const remaining = all.filter((w) => ms(w.endIso) > nowMs)
  const main = remaining[0]
  if (!main) {
    return { main: best, status: 'passe', earlierBest: null, alternative: all[1] ?? null }
  }
  const status: SlotStatus = ms(main.startIso) <= nowMs ? 'en_cours' : 'a_venir'
  return {
    main,
    status,
    earlierBest: main === best ? null : best,
    alternative: remaining[1] ?? null,
  }
}

export function windowSlots(day: DayAnalysis, w: HuntWindow): HourSlot[] {
  return day.slots.filter((s) => s.startIso >= w.startIso && s.startIso < w.endIso)
}

export function durationLabel(w: HuntWindow): string {
  const min = Math.round((ms(w.endIso) - ms(w.startIso)) / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

function clock(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(d)
}

/**
 * Raisons courtes (3 au plus), uniquement tirées des calculs : proximité du lever/coucher réel,
 * facteurs de conditions réellement évalués. Aucune raison inventée.
 */
export function reasonsFor(day: DayAnalysis, w: HuntWindow, timeZone: string): string[] {
  const out: string[] = []
  const start = ms(w.startIso)
  const end = ms(w.endIso)
  const H = 3_600_000
  const { sunrise, sunset } = day.sun
  if (sunrise && start < sunrise.getTime() + 2 * H && end > sunrise.getTime() - H)
    out.push(`Autour du lever du soleil (${clock(sunrise, timeZone)})`)
  else if (sunset && start < sunset.getTime() + H && end > sunset.getTime() - 2 * H)
    out.push(`Autour du coucher du soleil (${clock(sunset, timeZone)})`)
  else if (sunrise || sunset)
    out.push('Loin du lever et du coucher : activité de référence plus faible')

  const slots = windowSlots(day, w)
  const byFactor = new Map<
    string,
    { label: string; scores: number[]; value: string | null }
  >()
  for (const s of slots)
    for (const f of s.factors) {
      if (f.score === null) continue
      const cur = byFactor.get(f.id) ?? { label: f.label, scores: [], value: f.value }
      cur.scores.push(f.score)
      byFactor.set(f.id, cur)
    }
  const rated = [...byFactor.values()]
    .map((f) => ({ ...f, mean: f.scores.reduce((a, b) => a + b, 0) / f.scores.length }))
    .sort((a, b) => b.mean - a.mean)
  for (const f of rated.filter((x) => x.mean >= 70).slice(0, 2))
    out.push(`${f.label} : favorable${f.value ? ` (${f.value})` : ''}`)
  if (rated.length === 0)
    out.push('Météo non évaluée : classement fondé sur l’activité de référence seulement')
  else if (!rated.some((x) => x.mean >= 70))
    out.push('Conditions météo moyennes : aucun facteur nettement favorable')
  return out.slice(0, 3)
}

export interface WeatherBrief {
  temperatureC: number | null
  windKmh: number | null
  windFrom: string | null
  rainMm: number | null
  snowCm: number | null
  pressureHpa: number | null
  pressureTrend: string | null
}

export function compassLabel(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return COMPASS_8[idx]?.label ?? ''
}

/** Valeurs météo au milieu du créneau (heure centrale) ; `null` = donnée absente, jamais 0. */
export function weatherBrief(day: DayAnalysis, w: HuntWindow): WeatherBrief | null {
  const slots = windowSlots(day, w)
  const slot = slots[Math.floor(slots.length / 2)]
  const wx = slot?.weather
  if (!slot || !wx) return null
  const p = slot.pressure4h
  const trend =
    p && p.state === 'ok' && p.deltaHpa !== null
      ? `${p.deltaHpa > 0 ? '+' : ''}${p.deltaHpa} hPa/${p.windowHours} h (${
          p.nature === 'passee' ? 'passée' : p.nature === 'prevue' ? 'prévue' : 'mixte'
        })`
      : null
  return {
    temperatureC: wx.temperatureC,
    windKmh: wx.windSpeedKmh,
    windFrom: wx.windFromDegrees === null ? null : compassLabel(wx.windFromDegrees),
    rainMm: wx.precipitationMm,
    snowCm: wx.snowfallCm,
    pressureHpa: wx.surfacePressureHpa,
    pressureTrend: trend,
  }
}

/** La météo modifie-t-elle le classement ? Non si aucun facteur de condition n'est évalué. */
export function weatherDrivesRanking(day: DayAnalysis): boolean {
  return day.slots.some((s) => s.conditions !== null)
}
