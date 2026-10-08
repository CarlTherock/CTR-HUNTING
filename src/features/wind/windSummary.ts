import { haversineMeters } from '@/utils/geo'
import { isOptimalWind, nearestSample } from '@/utils/windField'
import { compassLabel } from '@/utils/terrain'
import type { Coordinate, WindField } from '@/types'

export type WindFavorability = 'favorable' | 'defavorable' | 'non-renseigne'

export interface WindHourEntry {
  /** Index in the shared hourly timeline (0 = soonest). */
  offset: number
  /** Local wall-clock `HH:mm` of the forecast location. */
  hourLabel: string
  /** Direction the wind blows FROM (meteorological convention). */
  directionDegrees: number
  directionLabel: string
  speedKmh: number
  gustsKmh: number
}

/** A field sample farther than this from the point is not "the wind here". */
export const MAX_SAMPLE_DISTANCE_METERS = 25_000

/** Real hourly entries at `coordinate`, from `startOffset`, limited to the
 * hours the loaded field really contains. Empty when there is no data. */
export function windHourlyRow(
  field: WindField | null,
  coordinate: Coordinate,
  startOffset = 0,
  count = 24,
): WindHourEntry[] {
  if (!field) return []
  const sample = nearestSample(field, coordinate)
  if (!sample) return []
  if (haversineMeters(coordinate, sample.coordinate) > MAX_SAMPLE_DISTANCE_METERS)
    return []
  return sample.hourly.slice(startOffset, startOffset + count).map((reading, i) => ({
    offset: startOffset + i,
    hourLabel: reading.time.slice(11, 16),
    directionDegrees: reading.directionDegrees,
    directionLabel: compassLabel(reading.directionDegrees),
    speedKmh: reading.speedKmh,
    gustsKmh: reading.gustsKmh,
  }))
}

/** Favorable only when the user saved sectors AND the wind comes from one;
 * with no saved sector the status is « non renseigné », never a guess. */
export function windFavorability(
  directionDegrees: number,
  favorableSectors: number[] | undefined,
): WindFavorability {
  if (!favorableSectors || favorableSectors.length === 0) return 'non-renseigne'
  return isOptimalWind(directionDegrees, favorableSectors) ? 'favorable' : 'defavorable'
}

export const FAVORABILITY_LABEL: Record<WindFavorability, string> = {
  favorable: 'Vent favorable pour ce spot',
  defavorable: 'Vent défavorable pour ce spot',
  'non-renseigne': 'Secteurs favorables non renseignés',
}

/** « N, NE, E » for the saved sectors, in compass order. */
export function sectorsLabel(sectors: number[] | undefined): string {
  if (!sectors || sectors.length === 0) return 'aucun'
  return [...sectors]
    .sort((a, b) => a - b)
    .map(compassLabel)
    .join(', ')
}
