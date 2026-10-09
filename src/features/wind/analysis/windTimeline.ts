import { compassLabel } from '@/utils/terrain'
import { hourIndexAt, localHourKey, nearestSample } from '@/utils/windField'
import type { Coordinate, WindField, WindHourlyReading } from '@/types'

/**
 * Pure logic of the « Analyse du vent » panel: which days/hours the loaded
 * wind field really covers, how to move between them, and what to show for
 * a slot. No React, no network — the panel only renders what this returns.
 *
 * The data is Open-Meteo's hourly series (one real sample per hour, local
 * time of the field's `timezone`); a slot is identified by its index in that
 * series — the very same index as `windStore.selectedHourOffset`, which is
 * what the map's particles, the Météo page and the charts already read.
 */

export interface ForecastSlot {
  /** Index in the hourly series = `selectedHourOffset`. */
  index: number
  /** Local wall-clock time as delivered by the source (`YYYY-MM-DDTHH:00`). */
  time: string
  /** Local hour of day, 0-23. */
  hour: number
}

export interface ForecastDay {
  /** `YYYY-MM-DD`, local date of the field's time zone. */
  dateKey: string
  relative: 'today' | 'tomorrow' | null
  slots: ForecastSlot[]
}

/** Resolution of the source: one sample per hour. */
export const SLOT_STEP_HOURS = 1

/** Past this age a fetched forecast is flagged as old (the source updates
 * its model runs every few hours). */
export const STALE_AFTER_MINUTES = 180

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Local `YYYY-MM-DD` of `now` in the field's time zone. */
export function todayKeyOf(field: WindField, now: Date): string {
  return localHourKey(now, field.timezone).slice(0, 10)
}

function isUsable(reading: WindHourlyReading | undefined): reading is WindHourlyReading {
  return (
    reading !== undefined &&
    Number.isFinite(reading.speedKmh) &&
    Number.isFinite(reading.directionDegrees)
  )
}

/**
 * The days the loaded field actually covers, from today on, each with its
 * real hourly slots. Nothing is invented beyond the source's horizon: with a
 * 48 h series that is « Aujourd'hui » and « Demain » only. Days already over
 * (an old cached field) are not offered.
 */
export function buildForecastDays(field: WindField | null, now: Date): ForecastDay[] {
  const hourly = field?.samples[0]?.hourly
  if (!field || !hourly || hourly.length === 0) return []
  const today = todayKeyOf(field, now)
  const tomorrow = addDays(today, 1)
  const days: ForecastDay[] = []
  hourly.forEach((reading, index) => {
    if (!isUsable(reading)) return
    const dateKey = reading.time.slice(0, 10)
    if (dateKey < today) return
    let day = days[days.length - 1]
    if (!day || day.dateKey !== dateKey) {
      day = {
        dateKey,
        relative: dateKey === today ? 'today' : dateKey === tomorrow ? 'tomorrow' : null,
        slots: [],
      }
      days.push(day)
    }
    day.slots.push({
      index,
      time: reading.time,
      hour: Number(reading.time.slice(11, 13)),
    })
  })
  return days
}

function utcDateOf(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`)
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** French label of a day: « Aujourd'hui », « Demain », else weekday + date
 * (« Sam. 10 oct. »). `compact` keeps only the short weekday and day number. */
export function dayLabel(day: ForecastDay, compact = false): string {
  if (day.relative === 'today') return "Aujourd'hui"
  if (day.relative === 'tomorrow') return 'Demain'
  const text = new Intl.DateTimeFormat(
    'fr-CA',
    compact
      ? { weekday: 'short', day: 'numeric', timeZone: 'UTC' }
      : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
  ).format(utcDateOf(day.dateKey))
  return capitalize(text)
}

/** Long date for the selected slot (« samedi 10 octobre »). */
export function longDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(utcDateOf(dateKey))
}

/** Short date for narrow panels (« ven. 9 oct. »). */
export function shortDateLabel(dateKey: string): string {
  return new Intl.DateTimeFormat('fr-CA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(utcDateOf(dateKey))
}

/** `HH:00` straight from the source's local time string (no re-zoning). */
export function formatSlotTime(time: string): string {
  return `${time.slice(11, 13)}:${time.slice(14, 16) || '00'}`
}

export function findDayOfIndex(days: ForecastDay[], index: number): ForecastDay | null {
  return days.find((day) => day.slots.some((slot) => slot.index === index)) ?? null
}

export function allSlots(days: ForecastDay[]): ForecastSlot[] {
  return days.flatMap((day) => day.slots)
}

/** The available slot nearest to `index` (the index itself when it exists),
 * or `null` with no slot at all. Ties go to the earlier slot. */
export function nearestAvailableIndex(days: ForecastDay[], index: number): number | null {
  const slots = allSlots(days)
  if (slots.length === 0) return null
  let best = slots[0]
  for (const slot of slots) {
    if (Math.abs(slot.index - index) < Math.abs(best.index - index)) best = slot
  }
  return best.index
}

/** Moves `delta` available slots away from `index` (clamped to the ends). */
export function stepIndex(
  days: ForecastDay[],
  index: number,
  delta: number,
): number | null {
  const slots = allSlots(days)
  if (slots.length === 0) return null
  const at = slots.findIndex((slot) => slot.index === index)
  const from = at === -1 ? slots.findIndex((s) => s.index >= index) : at
  const base = from === -1 ? slots.length - 1 : from
  return slots[Math.max(0, Math.min(slots.length - 1, base + delta))].index
}

export interface DayChange {
  index: number
  /** `false` when the same hour of day does not exist on the new day and a
   * nearby slot was chosen instead (the panel then says so). */
  sameHour: boolean
  hour: number
}

/** Index to select when switching to `target`: the same local hour of day
 * when that slot exists, otherwise the nearest available hour of that day. */
export function slotForDayChange(
  target: ForecastDay,
  currentHour: number,
): DayChange | null {
  if (target.slots.length === 0) return null
  const exact = target.slots.find((slot) => slot.hour === currentHour)
  if (exact) return { index: exact.index, sameHour: true, hour: exact.hour }
  let best = target.slots[0]
  for (const slot of target.slots) {
    if (Math.abs(slot.hour - currentHour) < Math.abs(best.hour - currentHour)) best = slot
  }
  return { index: best.index, sameHour: false, hour: best.hour }
}

/** Slot covering the current real hour — `null` when the loaded field does
 * not contain it (old cache): « Maintenant » then selects nothing. */
export function nowSlotIndex(field: WindField | null, now: Date): number | null {
  return field ? hourIndexAt(field, now) : null
}

export type SlotReading =
  | { kind: 'ok'; reading: WindHourlyReading; sampleCoordinate: Coordinate }
  | { kind: 'missing' }

/** Real reading of the grid sample nearest `coordinate` for slot `index`.
 * `missing` when the slot is absent or not a finite reading — never a guess,
 * never a fall-back to another hour. */
export function readSlot(
  field: WindField | null,
  coordinate: Coordinate,
  index: number,
): SlotReading {
  if (!field) return { kind: 'missing' }
  const sample = nearestSample(field, coordinate)
  const reading = sample?.hourly[index]
  if (!sample || !isUsable(reading)) return { kind: 'missing' }
  return { kind: 'ok', reading, sampleCoordinate: sample.coordinate }
}

export interface WindDescription {
  /** Cardinal the wind comes FROM (« NO »). */
  fromLabel: string
  fromDegrees: number
  /** Cardinal it blows TOWARD (« SE ») — what the particles follow. */
  toLabel: string
  toDegrees: number
  speedKmh: number
  gustsKmh: number | null
}

const normalize = (degrees: number) => ((degrees % 360) + 360) % 360

/** Origin (meteorological) and travel directions of a reading, kept apart so
 * the text always says where the wind comes from while arrows/particles go
 * the other way. Gusts are `null` when the source gave none. */
export function describeWind(reading: WindHourlyReading): WindDescription {
  const from = normalize(reading.directionDegrees)
  const to = normalize(from + 180)
  return {
    fromLabel: compassLabel(from),
    fromDegrees: Math.round(from) % 360,
    toLabel: compassLabel(to),
    toDegrees: Math.round(to) % 360,
    speedKmh: Math.round(reading.speedKmh),
    gustsKmh: Number.isFinite(reading.gustsKmh) ? Math.round(reading.gustsKmh) : null,
  }
}

export interface ForecastAge {
  minutes: number
  stale: boolean
  /** « il y a 12 min », « il y a 3 h ». */
  label: string
}

export function forecastAge(fetchedAt: string | null, now: Date): ForecastAge | null {
  if (!fetchedAt) return null
  const time = Date.parse(fetchedAt)
  if (!Number.isFinite(time)) return null
  const minutes = Math.max(0, Math.round((now.getTime() - time) / 60_000))
  const label =
    minutes < 1
      ? "à l'instant"
      : minutes < 60
        ? `il y a ${minutes} min`
        : minutes < 48 * 60
          ? `il y a ${Math.round(minutes / 60)} h`
          : `il y a ${Math.round(minutes / 1440)} j`
  return { minutes, stale: minutes > STALE_AFTER_MINUTES, label }
}

export type AnalysisStatus =
  'loading' | 'unavailable' | 'ready' | 'refreshing' | 'cached' | 'refresh-failed'

/** What the panel can honestly claim about its data. */
export function analysisStatus(input: {
  hasField: boolean
  loading: boolean
  failed: boolean
  fromCache: boolean
}): AnalysisStatus {
  if (!input.hasField) return input.loading ? 'loading' : 'unavailable'
  if (input.loading) return 'refreshing'
  if (input.fromCache) return 'cached'
  if (input.failed) return 'refresh-failed'
  return 'ready'
}

/** Whether `center` lies inside `bounds` widened by `margin` degrees — used
 * to accept an offline copy only for the area it was fetched for. */
export function boundsCover(
  bounds: { south: number; west: number; north: number; east: number },
  center: Coordinate,
  margin = 0,
): boolean {
  return (
    center.lat >= bounds.south - margin &&
    center.lat <= bounds.north + margin &&
    center.lng >= bounds.west - margin &&
    center.lng <= bounds.east + margin
  )
}
