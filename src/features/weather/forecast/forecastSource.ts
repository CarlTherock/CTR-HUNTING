import type { Coordinate, PointDaily, PointForecast, SavedForecast } from '@/types'
import { haversineMeters } from '@/utils/geo'
import { zonedDateKey } from '@/features/hunting-hours/zonedTime'
import { SAME_PLACE_METERS, coverageAt } from '../offline/savedForecastLogic'

/** Where the shown forecast comes from — always displayed, never hidden. */
export type ForecastOrigin = 'live' | 'cached' | 'saved'

export type ForecastSource =
  | {
      kind: 'ready'
      point: PointForecast
      origin: ForecastOrigin
      /** ISO UTC of the retrieval. */
      fetchedAt: string
      /** Set for `saved`. */
      saved: SavedForecast | null
    }
  | { kind: 'none'; reason: 'none' | 'ended' }

export interface LivePoint {
  point: PointForecast
  coordinate: Coordinate
  fetchedAt: string
  /** `live` = fetched now, `cached` = the last copy kept on the device. */
  origin: 'live' | 'cached'
}

function sameArea(a: Coordinate, b: Coordinate): boolean {
  return haversineMeters(a, b) <= SAME_PLACE_METERS
}

/** Local date of `now` in the forecast's zone. */
export function todayKey(point: PointForecast, now: Date): string {
  try {
    return zonedDateKey(now, point.timezone)
  } catch {
    return zonedDateKey(now, 'UTC')
  }
}

/**
 * Which forecast the page shows for `coordinate`. A live answer wins; offline
 * (or failed) it is the newest of the last cached copy and the saved downloads
 * made for THIS place whose period still reaches today. A forecast made for
 * another place, or whose days are all over, is never substituted.
 */
export function chooseForecastSource(input: {
  live: LivePoint | null
  saved: SavedForecast[]
  coordinate: Coordinate
  now: Date
}): ForecastSource {
  const { live, saved, coordinate, now } = input
  if (live && live.origin === 'live') {
    return {
      kind: 'ready',
      point: live.point,
      origin: 'live',
      fetchedAt: live.fetchedAt,
      saved: null,
    }
  }
  interface Candidate {
    point: PointForecast
    origin: ForecastOrigin
    fetchedAt: string
    saved: SavedForecast | null
  }
  const candidates: Candidate[] = []
  let ended = false
  if (live && sameArea(live.coordinate, coordinate) && reachesToday(live.point, now)) {
    candidates.push({
      point: live.point,
      origin: 'cached',
      fetchedAt: live.fetchedAt,
      saved: null,
    })
  } else if (live && sameArea(live.coordinate, coordinate)) {
    ended = true
  }
  for (const s of saved) {
    if (!s.point || !sameArea(s.place.coordinate, coordinate)) continue
    if (coverageAt(s, now).state === 'ended' || !reachesToday(s.point, now)) {
      ended = true
      continue
    }
    candidates.push({ point: s.point, origin: 'saved', fetchedAt: s.fetchedAt, saved: s })
  }
  candidates.sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
  const best = candidates[0]
  if (best) return { kind: 'ready', ...best }
  return { kind: 'none', reason: ended ? 'ended' : 'none' }
}

function reachesToday(point: PointForecast, now: Date): boolean {
  const today = todayKey(point, now)
  return point.daily.some((d) => d.date >= today)
}

/** Days from today on (days already over are not offered). */
export function visibleDays(point: PointForecast, now: Date): PointDaily[] {
  const today = todayKey(point, now)
  return point.daily.filter((d) => d.date >= today)
}

/** Hourly slots of one local date. */
export function hoursOf(point: PointForecast, dateKey: string) {
  return point.hourly.filter((h) => h.time.startsWith(dateKey))
}

/** The hour to show first for a day: now's hour today, else 12:00, else the first slot. */
export function defaultHourKey(
  point: PointForecast,
  dateKey: string,
  now: Date,
): string | null {
  const hours = hoursOf(point, dateKey)
  if (hours.length === 0) return null
  if (todayKey(point, now) === dateKey) {
    const nowKey = `${dateKey}T${new Intl.DateTimeFormat('en-CA', {
      timeZone: point.timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now)}:00`
    const exact = hours.find((h) => h.time === nowKey)
    if (exact) return exact.time
  }
  return (hours.find((h) => h.time.endsWith('T12:00')) ?? hours[0]).time
}

/**
 * Index of the hour `hourKey` (`YYYY-MM-DDTHH:00`, place clock) in a wind
 * field, or `null` when the loaded field does not contain it — the page then
 * says so instead of pointing the analysis at another hour.
 */
export function windIndexOfHour(
  field: { samples: { hourly: { time: string }[] }[] } | null,
  hourKey: string,
): number | null {
  const series = field?.samples[0]?.hourly
  if (!series) return null
  const i = series.findIndex((h) => h.time.slice(0, 13) === hourKey.slice(0, 13))
  return i === -1 ? null : i
}
