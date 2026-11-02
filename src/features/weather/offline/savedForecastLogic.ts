import { boundsCover } from '@/features/wind/analysis/windTimeline'
import { haversineMeters } from '@/utils/geo'
import { localHourKey } from '@/utils/windField'
import type { LngLatBounds } from '@/utils/tiles'
import {
  SAVED_FORECAST_FORMAT_VERSION,
  type Coordinate,
  type PointForecast,
  type SavedForecast,
  type SavedForecastMissing,
  type SavedForecastPlace,
  type WindField,
} from '@/types'

/**
 * Pure rules of « Télécharger pour ma sortie »: what a download asks for, when
 * it may be called complete, what it covers, and when a saved forecast may be
 * used for a place and a moment. No React, no network, no database.
 */

export interface DownloadPeriod {
  days: number
  label: string
  hint: string
}

/** Periods offered. The provider documents `forecast_days` from 1 to 16; only
 * the first week is offered here because model reliability falls with the
 * horizon, and the app promises nothing beyond what it saves. */
export const DOWNLOAD_PERIODS: DownloadPeriod[] = [
  { days: 1, label: '1 jour', hint: "Aujourd'hui seulement (24 h)" },
  { days: 2, label: '2 jours', hint: '48 h' },
  { days: 3, label: '3 jours', hint: '72 h — recommandé' },
  { days: 5, label: '5 jours', hint: '120 h — moins fiable au-delà de 3 jours' },
  { days: 7, label: '7 jours', hint: '168 h — indicatif' },
]
export const DEFAULT_DOWNLOAD_DAYS = 3

/** Saved forecasts kept at once; the user deletes one to make room. */
export const MAX_SAVED_FORECASTS = 8

/** Half-width (°) of the wind grid around the place — the same margin the
 * Météo page's wind panel already uses for its own batched request. */
export const WIND_ZONE_HALF_DEGREES = 0.15

/** Hours after which a saved forecast is flagged « anciennes ». A project
 * choice (a model forecast loses value within hours), not a provider figure. */
export const SAVED_STALE_AFTER_HOURS = 12

/** A place is considered « the same » as a saved one within this distance. */
export const SAME_PLACE_METERS = 10_000

/** Margin (°) when matching the map centre to a saved wind zone. */
const ZONE_MATCH_MARGIN_DEGREES = 0.02

/** 5 × 5, as the live wind field. */
export const WIND_GRID_SIZE = 5

/** Wind grid area around a place: about 33 km on each side (longitude scaled
 * so the zone is roughly square). */
export function windZoneBounds(center: Coordinate): LngLatBounds {
  const cos = Math.max(0.2, Math.cos((center.lat * Math.PI) / 180))
  const halfLng = WIND_ZONE_HALF_DEGREES / cos
  return {
    west: center.lng - halfLng,
    east: center.lng + halfLng,
    south: center.lat - WIND_ZONE_HALF_DEGREES,
    north: center.lat + WIND_ZONE_HALF_DEGREES,
  }
}

export function windZoneSizeKm(bounds: LngLatBounds): {
  widthKm: number
  heightKm: number
} {
  const midLat = (bounds.north + bounds.south) / 2
  const midLng = (bounds.east + bounds.west) / 2
  return {
    widthKm:
      haversineMeters(
        { lat: midLat, lng: bounds.west },
        { lat: midLat, lng: bounds.east },
      ) / 1000,
    heightKm:
      haversineMeters(
        { lat: bounds.south, lng: midLng },
        { lat: bounds.north, lng: midLng },
      ) / 1000,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** `YYYY-MM-DD` of `date` on the DEVICE calendar. */
export function deviceDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDaysKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Dates a download will cover, shown BEFORE downloading. The place's own time
 * zone is only known once the provider answers, so this uses the device
 * calendar; the saved record then carries the real first and last hour.
 */
export function expectedDates(
  now: Date,
  days: number,
): { from: string; to: string; count: number } {
  const from = deviceDateKey(now)
  return { from, to: addDaysKey(from, Math.max(1, days) - 1), count: Math.max(1, days) }
}

function utcDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`)
}

/** « lun. 2 nov. » from a `YYYY-MM-DD` key (no time-zone shift). */
export function formatDateKey(dateKey: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utcDate(dateKey.slice(0, 10)))
}

/** « lun. 2 nov., 14 h » from the provider's local `YYYY-MM-DDTHH:mm`. */
export function formatLocalMoment(local: string): string {
  const hour = Number(local.slice(11, 13))
  const minute = local.slice(14, 16)
  const time = Number.isFinite(hour)
    ? `${hour} h${minute && minute !== '00' ? ` ${minute}` : ''}`
    : ''
  return `${formatDateKey(local)}${time ? `, ${time}` : ''}`
}

/** Fetch moment shown in the viewer's own zone (« 2 nov. 2026, 14 h 05 »). */
export function formatFetchedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'date inconnue'
  return new Intl.DateTimeFormat('fr-CA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(date)
    .replace(/\s+/g, ' ')
}

export function savedAgeHours(
  saved: Pick<SavedForecast, 'fetchedAt'>,
  now: Date,
): number {
  const t = Date.parse(saved.fetchedAt)
  return Number.isFinite(t) ? Math.max(0, (now.getTime() - t) / 3_600_000) : Infinity
}

export function isStale(saved: Pick<SavedForecast, 'fetchedAt'>, now: Date): boolean {
  return savedAgeHours(saved, now) > SAVED_STALE_AFTER_HOURS
}

export function ageLabel(saved: Pick<SavedForecast, 'fetchedAt'>, now: Date): string {
  const hours = savedAgeHours(saved, now)
  if (!Number.isFinite(hours)) return 'âge inconnu'
  if (hours < 1) return `il y a ${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 48) return `il y a ${Math.round(hours)} h`
  return `il y a ${Math.round(hours / 24)} j`
}

// ---------------------------------------------------------------- completeness

const usable = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/** Distinct local dates of an hourly series and the hours per date. */
function hoursPerDate(times: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of times) {
    const key = t.slice(0, 10)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

export interface Completeness {
  status: 'complete' | 'partial'
  missing: SavedForecastMissing[]
  validFrom: string | null
  validTo: string | null
  /** Hourly slots of the point forecast lacking temperature, wind speed or direction. */
  pointSlotsWithoutRequired: number
  /** Wind-grid slots (over all samples) lacking speed or direction. */
  windSlotsWithoutRequired: number
  windSamples: number
}

/**
 * `complete` only when BOTH parts arrived, cover the requested number of
 * calendar days (a day may have 23 or 25 hours at a clock change), and every
 * hour has the values the wind analysis cannot do without: temperature, wind
 * speed and wind direction for the place, speed and direction on every grid
 * sample. Optional variables (visibility, UV…) never block completeness — they
 * are simply shown « indisponible ».
 */
export function assessDownload(input: {
  point: PointForecast | null
  windField: WindField | null
  requestedDays: number
}): Completeness {
  const missing: SavedForecastMissing[] = []
  const { point, windField, requestedDays } = input

  let pointSlotsWithoutRequired = 0
  let validFrom: string | null = null
  let validTo: string | null = null
  if (!point || point.hourly.length === 0) {
    missing.push('point')
  } else {
    const times = point.hourly.map((h) => h.time)
    validFrom = times[0]
    validTo = times[times.length - 1]
    const perDate = hoursPerDate(times)
    const fullDays = [...perDate.values()].filter((n) => n >= 23).length
    if (fullDays < requestedDays) missing.push('hours')
    pointSlotsWithoutRequired = point.hourly.filter(
      (h) =>
        !usable(h.temperatureCelsius) ||
        !usable(h.windSpeedKmh) ||
        !usable(h.windDirectionDegrees),
    ).length
    if (pointSlotsWithoutRequired > 0 && !missing.includes('hours')) missing.push('hours')
  }

  let windSlotsWithoutRequired = 0
  const windSamples = windField?.samples.length ?? 0
  if (!windField || windSamples < WIND_GRID_SIZE * WIND_GRID_SIZE) {
    missing.push('wind-grid')
  } else {
    for (const sample of windField.samples) {
      const perDate = hoursPerDate(sample.hourly.map((h) => h.time))
      if ([...perDate.values()].filter((n) => n >= 23).length < requestedDays) {
        if (!missing.includes('hours')) missing.push('hours')
      }
      windSlotsWithoutRequired += sample.hourly.filter(
        (h) => !usable(h.speedKmh) || !usable(h.directionDegrees),
      ).length
    }
    if (windSlotsWithoutRequired > 0 && !missing.includes('hours')) missing.push('hours')
    if (!validFrom) {
      const first = windField.samples[0]?.hourly
      validFrom = first?.[0]?.time ?? null
      validTo = first?.[first.length - 1]?.time ?? null
    }
  }

  return {
    status: missing.length === 0 ? 'complete' : 'partial',
    missing,
    validFrom,
    validTo,
    pointSlotsWithoutRequired,
    windSlotsWithoutRequired,
    windSamples,
  }
}

export const MISSING_LABEL: Record<SavedForecastMissing, string> = {
  point: 'prévision du lieu (température, précipitations, soleil…)',
  'wind-grid': 'grille de vent autour du lieu',
  hours: 'certaines heures ou valeurs de vent',
}

/** Builds the record to store. `now` and `id` are injected for testing. */
export function buildSavedForecast(input: {
  id: string
  place: SavedForecastPlace
  point: PointForecast | null
  windField: WindField | null
  windBounds: LngLatBounds | null
  requestedDays: number
  fetchedAt: string
}): SavedForecast {
  const c = assessDownload(input)
  const record: SavedForecast = {
    id: input.id,
    formatVersion: SAVED_FORECAST_FORMAT_VERSION,
    place: input.place,
    provider: { name: 'Open-Meteo', url: 'https://open-meteo.com' },
    fetchedAt: input.fetchedAt,
    timezone: input.point?.timezone ?? input.windField?.timezone ?? 'UTC',
    requestedDays: input.requestedDays,
    validFrom: c.validFrom,
    validTo: c.validTo,
    units: {
      temperature: '°C',
      speed: 'km/h',
      precipitation: 'mm',
      pressure: 'hPa',
      visibility: 'm',
      direction: '°',
    },
    status: c.status,
    missing: c.missing,
    point: input.point,
    windField: input.windField,
    windBounds: input.windField ? input.windBounds : null,
    approxBytes: 0,
  }
  record.approxBytes = JSON.stringify(record).length
  return record
}

/**
 * An update never replaces a better saved forecast with a worse one: a
 * complete download is only replaced by another complete one, a partial one by
 * a complete or an equally partial one that is newer.
 */
export function shouldReplace(
  previous: Pick<SavedForecast, 'status'> | undefined,
  next: Pick<SavedForecast, 'status'>,
): boolean {
  if (!previous) return true
  if (previous.status === 'complete') return next.status === 'complete'
  return true
}

// -------------------------------------------------------------------- coverage

export type CoverageState = 'current' | 'ended' | 'not-started' | 'unknown'

export interface Coverage {
  state: CoverageState
  /** Local `YYYY-MM-DDTHH:mm` of the last hour covered. */
  until: string | null
}

/** Whether `now` (read on the PLACE's clock, not the phone's zone) falls in the
 * period the saved forecast really contains. */
export function coverageAt(
  saved: Pick<SavedForecast, 'validFrom' | 'validTo' | 'timezone'>,
  now: Date,
): Coverage {
  if (!saved.validFrom || !saved.validTo) return { state: 'unknown', until: null }
  let key: string
  try {
    key = localHourKey(now, saved.timezone)
  } catch {
    return { state: 'unknown', until: saved.validTo }
  }
  const nowKey = key.slice(0, 13)
  if (nowKey < saved.validFrom.slice(0, 13)) {
    return { state: 'not-started', until: saved.validTo }
  }
  if (nowKey > saved.validTo.slice(0, 13)) return { state: 'ended', until: saved.validTo }
  return { state: 'current', until: saved.validTo }
}

export function coverageUntilLabel(coverage: Coverage): string | null {
  return coverage.until
    ? `Couverture jusqu’au ${formatLocalMoment(coverage.until)}`
    : null
}

export type SavedStatusKind = 'saved' | 'offline-saved' | 'stale' | 'expired' | 'partial'

export interface SavedStatus {
  /** Lines to show, in order. Each says what the data is, never « en direct ». */
  lines: string[]
  kinds: SavedStatusKind[]
}

/** The honest status lines of a saved forecast: what it is, when it was
 * fetched, how far it covers, whether it is old. */
export function describeSavedStatus(
  saved: SavedForecast,
  now: Date,
  online: boolean,
): SavedStatus {
  const lines: string[] = []
  const kinds: SavedStatusKind[] = []
  const coverage = coverageAt(saved, now)
  const fetched = formatFetchedAt(saved.fetchedAt)
  if (online) {
    lines.push('Prévisions enregistrées')
    kinds.push('saved')
  } else {
    lines.push(`Hors ligne — prévisions téléchargées le ${fetched}`)
    kinds.push('offline-saved')
  }
  const until = coverageUntilLabel(coverage)
  if (until) lines.push(until)
  if (coverage.state === 'ended') {
    lines.push(
      'Ces prévisions sont terminées : elles ne couvrent plus le moment présent.',
    )
    kinds.push('expired')
  } else if (isStale(saved, now)) {
    lines.push(`Prévisions anciennes (${ageLabel(saved, now)})`)
    kinds.push('stale')
  }
  if (saved.status === 'partial') {
    lines.push(
      `Téléchargement partiel : ${saved.missing.map((m) => MISSING_LABEL[m]).join(' ; ')} manquant.`,
    )
    kinds.push('partial')
  }
  return { lines, kinds }
}

export const NO_SAVED_FORECAST_MESSAGE =
  'Aucune prévision enregistrée pour ce lieu et cette date'

// --------------------------------------------------------------------- lookup

export type SavedLookup =
  | { kind: 'found'; saved: SavedForecast; coverage: Coverage }
  | { kind: 'ended'; saved: SavedForecast }
  | { kind: 'none' }

/**
 * Saved forecast usable by the wind analysis for the map centre `center` at
 * `now`: its wind zone must contain the centre AND its period must contain the
 * current hour. Nothing is substituted: another place or another date is
 * `none` / `ended`, never silently used.
 */
export function findSavedWind(
  saved: SavedForecast[],
  center: Coordinate,
  now: Date,
): SavedLookup {
  const inZone = saved.filter(
    (s) =>
      s.formatVersion === SAVED_FORECAST_FORMAT_VERSION &&
      s.windField !== null &&
      s.windBounds !== null &&
      boundsCover(s.windBounds, center, ZONE_MATCH_MARGIN_DEGREES),
  )
  if (inZone.length === 0) return { kind: 'none' }
  const current = inZone
    .map((s) => ({ s, coverage: coverageAt(s, now) }))
    .filter((x) => x.coverage.state === 'current')
    .sort((a, b) => b.s.fetchedAt.localeCompare(a.s.fetchedAt))
  if (current.length > 0) {
    return { kind: 'found', saved: current[0].s, coverage: current[0].coverage }
  }
  const newest = [...inZone].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0]
  return { kind: 'ended', saved: newest }
}

/** Whether a saved forecast was made for `coordinate` (same place, ≤ 10 km). */
export function isSamePlace(saved: SavedForecast, coordinate: Coordinate): boolean {
  return haversineMeters(saved.place.coordinate, coordinate) <= SAME_PLACE_METERS
}

// ---------------------------------------------------------------------- storage

/** Estimated free storage (bytes) or `null` when the browser cannot tell. */
export async function freeStorageBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate || typeof estimate.quota !== 'number') return null
    return Math.max(0, estimate.quota - (estimate.usage ?? 0))
  } catch {
    return null
  }
}

/** True when a write of `bytes` clearly would not fit (needs 2× headroom). */
export function wouldNotFit(bytes: number, freeBytes: number | null): boolean {
  return freeBytes !== null && freeBytes < bytes * 2
}
