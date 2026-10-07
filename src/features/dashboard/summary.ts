import {
  effectiveAreaStatus,
  type EffectiveAreaStatus,
} from '@/features/offline/areaStatus'
import type {
  Observation,
  OfflineArea,
  Track,
  WeatherForecast,
  WeatherConditions,
} from '@/types'

/**
 * Pure summaries for the home page. They only reshape data the app already
 * holds; nothing here fetches, guesses or fills a missing value.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** « à l’instant », « il y a 5 min », « il y a 3 h », « il y a 2 j ». */
export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'date inconnue'
  if (ms < MINUTE_MS) return 'à l’instant'
  if (ms < HOUR_MS) return `il y a ${Math.floor(ms / MINUTE_MS)} min`
  if (ms < DAY_MS) return `il y a ${Math.floor(ms / HOUR_MS)} h`
  return `il y a ${Math.floor(ms / DAY_MS)} j`
}

// ---- Last outing ----------------------------------------------------------

export interface LastOuting {
  kind: 'track' | 'observation'
  label: string
  /** ISO 8601 */
  at: string
}

const MAX_LABEL = 60

function firstLine(notes: string): string {
  const line = notes.trim().split('\n')[0] ?? ''
  return line.length > MAX_LABEL ? `${line.slice(0, MAX_LABEL - 1)}…` : line
}

/** The most recent track (by start) or journal entry (by time). Records with
 * an unreadable date are ignored rather than guessed. */
export function lastOuting(
  tracks: readonly Track[],
  observations: readonly Observation[],
): LastOuting | null {
  const candidates: LastOuting[] = []
  for (const track of tracks) {
    if (Number.isNaN(Date.parse(track.startedAt))) continue
    candidates.push({ kind: 'track', label: track.name, at: track.startedAt })
  }
  for (const observation of observations) {
    if (Number.isNaN(Date.parse(observation.timestamp))) continue
    candidates.push({
      kind: 'observation',
      label: firstLine(observation.notes) || 'Entrée de journal',
      at: observation.timestamp,
    })
  }
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) =>
    Date.parse(c.at) > Date.parse(best.at) ? c : best,
  )
}

// ---- Offline areas ----------------------------------------------------------

export type OfflineCounts = Record<EffectiveAreaStatus, number>

export function offlineCounts(areas: readonly OfflineArea[]): {
  total: number
  byStatus: OfflineCounts
} {
  const byStatus: OfflineCounts = {
    downloading: 0,
    complete: 0,
    'complete-unverified': 0,
    incomplete: 0,
    interrupted: 0,
    error: 0,
  }
  for (const area of areas) byStatus[effectiveAreaStatus(area)] += 1
  return { total: areas.length, byStatus }
}

// ---- Weather ---------------------------------------------------------------

/** A reading is called « actuel » only while it is recent. */
export const CURRENT_MAX_AGE_MS = 90 * MINUTE_MS
/** How far ahead of the sampled clock a fresh reading may look. */
const CLOCK_TICK_TOLERANCE_MS = 2 * MINUTE_MS
/** The forecast line looks this many hours after the current hour. */
export const FORECAST_LOOKAHEAD_HOURS = 3

export interface WeatherSummary {
  /** `current`: fetched recently from the provider; `saved`: an older copy
   * kept on the device (or a cached fallback) — never passed off as current. */
  freshness: 'current' | 'saved'
  ageLabel: string
  /** `HH:MM` in the forecast place's own time zone, as Open-Meteo returns it. */
  currentTime: string
  conditions: WeatherConditions
  forecast: {
    time: string
    temperatureCelsius: number
    windSpeedKmh: number
    windGustsKmh: number
  } | null
}

export function summarizeWeather(
  forecast: WeatherForecast,
  fetchedAt: string | null,
  isCached: boolean,
  now: Date,
): WeatherSummary {
  const fetched = fetchedAt ? Date.parse(fetchedAt) : Number.NaN
  const rawAge = Number.isNaN(fetched) ? Number.NaN : now.getTime() - fetched
  // The page's clock is sampled once a minute: a reading fetched since the
  // last tick looks slightly « in the future ». That is a stale sample, not a
  // wrong date; anything further in the future stays unknown.
  const age = rawAge < 0 && rawAge >= -CLOCK_TICK_TOLERANCE_MS ? 0 : rawAge
  const freshness: WeatherSummary['freshness'] =
    !isCached && Number.isFinite(age) && age >= 0 && age <= CURRENT_MAX_AGE_MS
      ? 'current'
      : 'saved'

  const from = forecast.hourly.findIndex((h) => h.time >= forecast.current.timestamp)
  const entry = from === -1 ? undefined : forecast.hourly[from + FORECAST_LOOKAHEAD_HOURS]

  return {
    freshness,
    ageLabel: formatAge(age),
    currentTime: forecast.current.timestamp.slice(11, 16),
    conditions: forecast.current,
    forecast: entry
      ? {
          time: entry.time.slice(11, 16),
          temperatureCelsius: entry.temperatureCelsius,
          windSpeedKmh: entry.windSpeedKmh,
          windGustsKmh: entry.windGustsKmh,
        }
      : null,
  }
}
