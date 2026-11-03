import type { WindField } from '@/types'
import { hourIndexAt } from '@/utils/windField'

export type WindSyncState =
  | { state: 'no-field' }
  | { state: 'synced'; windHourLabel: string }
  | { state: 'out-of-range'; windHourLabel: string }

/** « 14 h » from an Open-Meteo hourly time (`2026-11-03T14:00`, local to the
 * field's time zone). */
function hourLabel(time: string | undefined): string {
  if (!time) return '—'
  return `${Number(time.slice(11, 13))} h`
}

/**
 * Compares the instant of the displayed weather frame with the hour the wind
 * particles actually show. The two normally agree (the frame drives the wind
 * hour); when the frame falls outside the wind forecast's period the particles
 * keep their last hour, and the panel must say so instead of letting the two
 * readings look contradictory.
 */
export function windSync(
  field: WindField | null,
  frameTime: string | null,
  selectedHourOffset: number,
): WindSyncState {
  if (!field || field.samples.length === 0) return { state: 'no-field' }
  const windHourLabel = hourLabel(field.samples[0].hourly[selectedHourOffset]?.time)
  if (!frameTime) return { state: 'synced', windHourLabel }
  return hourIndexAt(field, new Date(frameTime)) === null
    ? { state: 'out-of-range', windHourLabel }
    : { state: 'synced', windHourLabel }
}
