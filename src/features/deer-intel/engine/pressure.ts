import type { PointForecast } from '@/types'
import { utcFromZoned } from '@/features/hunting-hours/zonedTime'

/** Type de pression fourni : Open-Meteo `surface_pressure` = pression de STATION, pas ramenée au niveau marin. */
export const PRESSURE_TYPE = 'surface' as const

export interface PressurePoint {
  /** Instant UTC de l'heure locale. */
  iso: string
  hpa: number | null
}

export type PressureNature = 'passee' | 'prevue' | 'mixte'

export interface PressureChange {
  state: 'ok' | 'indisponible'
  /** Fenêtre demandée (h) et fenêtre réellement couverte (durée écoulée). */
  windowHours: number
  elapsedHours: number | null
  deltaHpa: number | null
  slopeHpaPerHour: number | null
  fromIso: string | null
  toIso: string | null
  /** Passée (calcul sur des heures déjà écoulées), prévue (heures futures) ou mixte. */
  nature: PressureNature | null
  reason: string | null
}

/** Série horaire de pression, indexée par instant UTC (heure d'été = durée écoulée, pas heure du mur). */
export function pressureSeries(
  forecast: PointForecast | null,
  timeZone: string,
): PressurePoint[] {
  const out: PressurePoint[] = []
  for (const h of forecast?.hourly ?? []) {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(h.time)
    if (!m) continue
    const iso = utcFromZoned(m[1], Number(m[2]), Number(m[3]), timeZone).toISOString()
    out.push({ iso, hpa: h.surfacePressureHpa })
  }
  return out
}

const unavailable = (windowHours: number, reason: string): PressureChange => ({
  state: 'indisponible',
  windowHours,
  elapsedHours: null,
  deltaHpa: null,
  slopeHpaPerHour: null,
  fromIso: null,
  toIso: null,
  nature: null,
  reason,
})

/**
 * Variation de pression sur une fenêtre de `windowHours` heures ÉCOULÉES se terminant à `atIso`.
 * Calcul technique (delta = P(t) − P(t−fenêtre) ; pente = delta / durée), pas une reproduction
 * certifiée d'une étude. Une borne absente donne « indisponible » (jamais 0) ; aucune
 * interpolation silencieuse. `nowIso` sépare tendance passée et variation prévue.
 */
export function pressureChange(
  series: readonly PressurePoint[],
  atIso: string,
  windowHours: number,
  nowIso: string,
): PressureChange {
  const to = Date.parse(atIso)
  const from = to - windowHours * 3_600_000
  const end = series.find((p) => Date.parse(p.iso) === to)
  const start = series.find((p) => Date.parse(p.iso) === from)
  if (!end || end.hpa === null)
    return unavailable(windowHours, 'Pression absente à la fin de la fenêtre.')
  if (!start || start.hpa === null)
    return unavailable(windowHours, 'Pression absente au début de la fenêtre.')
  const elapsed = (to - from) / 3_600_000
  const now = Date.parse(nowIso)
  const nature: PressureNature = to <= now ? 'passee' : from >= now ? 'prevue' : 'mixte'
  const delta = end.hpa - start.hpa
  return {
    state: 'ok',
    windowHours,
    elapsedHours: elapsed,
    deltaHpa: Math.round(delta * 100) / 100,
    slopeHpaPerHour: Math.round((delta / elapsed) * 100) / 100,
    fromIso: start.iso,
    toIso: end.iso,
    nature,
    reason: null,
  }
}
