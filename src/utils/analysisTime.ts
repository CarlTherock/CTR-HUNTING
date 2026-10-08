import { localHourKey } from './windField'
import type {
  WeatherConditions,
  WeatherForecast,
  WindField,
  WindHourlyReading,
} from '@/types'

/**
 * Cohérence temporelle de l'analyse. Trois états, jamais confondus :
 * - `current`  : l'heure en cours (relevé météo « actuel ») ;
 * - `forecast` : une heure future (prévision du modèle) ;
 * - `past`     : une heure déjà écoulée aujourd'hui (valeur de MODÈLE de
 *   Open-Meteo, pas une observation).
 * Toutes les fonctions sont pures et ne lisent que des données déjà
 * chargées : changer d'heure ne déclenche AUCUNE requête, et une heure qui
 * n'est pas dans les données n'est jamais extrapolée.
 */
export type HourKind = 'current' | 'forecast' | 'past'

export interface HourSelection {
  /** `YYYY-MM-DDTHH:00`, heure locale de la zone (format Open-Meteo). */
  hourKey: string
  kind: HourKind
  /** Instant évalué (maintenant pour `current`, le début de l'heure sinon). */
  instant: Date
  /** Midi local du jour de l'heure : référence pour les calculs de
   * soleil/lune. `computeTemporalData(date)` raisonne sur le jour UTC de
   * `date` ; avec un instant du soir (ex. 20 h locale = 00 h UTC le
   * lendemain) il prenait le coucher du JOUR SUIVANT et manquait la
   * fenêtre du crépuscule. */
  solarReference: Date
  /** `HH:mm` local. */
  clock: string
  /** Étiquette affichée sur chaque facteur météo/vent. */
  timeLabel: string
}

export interface HourOption {
  hourKey: string
  kind: HourKind
  label: string
  hasWind: boolean
  hasWeather: boolean
}

/** `2026-08-17T10:00` / `2026-08-17T10:15` → `2026-08-17T10:00`. */
export function hourKeyOf(time: string): string {
  return `${time.slice(0, 13)}:00`
}

function parseKey(key: string): [number, number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})/.exec(key)
  if (!m) return [1970, 1, 1, 0]
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
}

function offsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instantMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asUtc - Math.floor(instantMs / 1000) * 1000
}

/** L'instant réel d'une heure locale `YYYY-MM-DDTHH:00` dans `timeZone`
 * (sans fuseau : l'heure locale de l'appareil). Deux passes pour absorber
 * un changement d'heure. */
export function zonedHourToDate(hourKey: string, timeZone: string | undefined): Date {
  const [y, mo, d, h] = parseKey(hourKey)
  if (!timeZone) return new Date(y, mo - 1, d, h)
  const guess = Date.UTC(y, mo - 1, d, h)
  const first = guess - offsetMs(guess, timeZone)
  return new Date(guess - offsetMs(first, timeZone))
}

function dayDiff(hourKey: string, nowKey: string): number {
  const [y1, m1, d1] = parseKey(hourKey)
  const [y2, m2, d2] = parseKey(nowKey)
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000)
}

function dayPrefix(hourKey: string, nowKey: string): string {
  const diff = dayDiff(hourKey, nowKey)
  if (diff === 0) return ''
  if (diff === 1) return 'demain '
  if (diff === -1) return 'hier '
  const [, mo, d] = parseKey(hourKey)
  return `${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')} `
}

function kindOf(hourKey: string, nowKey: string): HourKind {
  // Même format de chaîne : l'ordre lexicographique est l'ordre chronologique.
  if (hourKey === nowKey) return 'current'
  return hourKey > nowKey ? 'forecast' : 'past'
}

function describe(hourKey: string, nowKey: string, kind: HourKind) {
  const clock = `${hourKey.slice(11, 13)}:00`
  const day = dayPrefix(hourKey, nowKey)
  const timeLabel =
    kind === 'current'
      ? 'actuel'
      : kind === 'forecast'
        ? `prévision pour ${day}${clock}`
        : `heure passée ${day}${clock} (valeur de modèle)`
  return { clock, timeLabel }
}

/** Fuseau des données chargées (météo en priorité), sinon `undefined`
 * (= fuseau de l'appareil). */
export function dataTimeZone(
  windField: WindField | null,
  weather: WeatherForecast | null,
): string | undefined {
  return weather?.timezone ?? windField?.timezone ?? undefined
}

/** Résout l'heure demandée (`null` = maintenant). */
export function resolveHour(
  requestedKey: string | null,
  now: Date,
  timeZone: string | undefined,
): HourSelection {
  const nowKey = localHourKey(
    now,
    timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
  const hourKey = requestedKey ?? nowKey
  const kind = kindOf(hourKey, nowKey)
  const { clock, timeLabel } = describe(hourKey, nowKey, kind)
  return {
    hourKey,
    kind,
    instant: kind === 'current' ? now : zonedHourToDate(hourKey, timeZone),
    solarReference: zonedHourToDate(`${hourKey.slice(0, 10)}T12:00`, timeZone),
    clock,
    timeLabel,
  }
}

/**
 * Heures sélectionnables : celles réellement présentes dans le vent ou la
 * météo chargés (rien d'extrapolé) + l'heure en cours (le relevé « actuel »
 * et le calcul solaire/lunaire existent même hors des tableaux horaires).
 */
export function buildHourOptions(
  windField: WindField | null,
  weather: WeatherForecast | null,
  now: Date,
): HourOption[] {
  const tz = dataTimeZone(windField, weather)
  const nowKey = localHourKey(now, tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const windKeys = new Set(
    (windField?.samples[0]?.hourly ?? []).map((h) => hourKeyOf(h.time)),
  )
  const weatherKeys = new Set((weather?.hourly ?? []).map((h) => hourKeyOf(h.time)))
  if (weather) weatherKeys.add(hourKeyOf(weather.current.timestamp))
  const all = new Set<string>([...windKeys, ...weatherKeys, nowKey])
  return [...all].sort().map((hourKey) => {
    const kind = kindOf(hourKey, nowKey)
    const { clock } = describe(hourKey, nowKey, kind)
    const day = dayPrefix(hourKey, nowKey)
    const prefix =
      kind === 'current' ? 'Actuel' : kind === 'forecast' ? 'Prévision' : 'Passé (modèle)'
    return {
      hourKey,
      kind,
      label: `${prefix} · ${day}${clock}`,
      hasWind: windKeys.has(hourKey),
      // L'heure en cours est couverte par le relevé « actuel ».
      hasWeather: weatherKeys.has(hourKey) || (kind === 'current' && weather !== null),
    }
  })
}

/** Index de l'heure `hourKey` dans une série horaire, `-1` si absente. */
export function hourIndexForKey(hourly: { time: string }[], hourKey: string): number {
  return hourly.findIndex((h) => hourKeyOf(h.time) === hourKey)
}

export interface WeatherAtHour {
  conditions: WeatherConditions | null
  /** Pourquoi il n'y a pas de météo pour cette heure. */
  reason?: string
  /** Horodatage de la donnée utilisée. */
  dataTime?: string
}

/** Conditions météo de l'heure choisie : le relevé « actuel » pour l'heure
 * en cours, l'entrée horaire correspondante sinon. Jamais extrapolé. */
export function weatherForHour(
  weather: WeatherForecast | null,
  hour: HourSelection,
): WeatherAtHour {
  if (!weather) return { conditions: null, reason: 'Aucune donnée météo chargée.' }
  if (hour.kind === 'current') {
    return { conditions: weather.current, dataTime: weather.current.timestamp }
  }
  const entry = weather.hourly.find((h) => hourKeyOf(h.time) === hour.hourKey)
  if (!entry) {
    return {
      conditions: null,
      reason: `L’heure ${hour.clock} n’est pas dans les données météo chargées.`,
    }
  }
  return {
    conditions: {
      timestamp: entry.time,
      temperatureCelsius: entry.temperatureCelsius,
      relativeHumidityPercent: entry.relativeHumidityPercent,
      surfacePressureHpa: entry.surfacePressureHpa,
      precipitationMm: entry.precipitationMm,
      cloudCoverPercent: entry.cloudCoverPercent,
      windSpeedKmh: entry.windSpeedKmh,
      windGustsKmh: entry.windGustsKmh,
      visibilityMeters: entry.visibilityMeters,
    },
    dataTime: entry.time,
  }
}

/** Lecture de vent de l'échantillon réel le plus proche (voir
 * `windField.nearestSample`) pour l'heure choisie, ou `null`. */
export function windReadingForHour(
  hourly: WindHourlyReading[] | undefined,
  hour: HourSelection,
): WindHourlyReading | null {
  if (!hourly) return null
  const index = hourIndexForKey(hourly, hour.hourKey)
  return index === -1 ? null : hourly[index]
}
