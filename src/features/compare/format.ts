import { formatAge } from '@/features/gps/gpsFreshness'
import { formatDistanceMeters, formatNumberFr } from '@/utils/format'
import { compassLabel } from '@/utils/terrain'
import type { CriterionStatus, WindValue } from './types'

export const STATUS_LABEL: Record<CriterionStatus, string> = {
  met: 'Satisfait',
  'not-met': 'Non satisfait',
  'not-evaluable': 'Non évaluable',
}

/** « O (270°) · 12 km/h · rafales 20 km/h » */
export function windSummary(wind: WindValue): string {
  const { reading } = wind
  return `${compassLabel(reading.directionDegrees)} (${Math.round(reading.directionDegrees)}°) · ${formatNumberFr(reading.speedKmh)} km/h · rafales ${formatNumberFr(reading.gustsKmh)} km/h`
}

export function sampleDistanceText(wind: WindValue): string {
  return wind.sampleDistanceMeters < 50
    ? 'point de grille du modèle au point'
    : `point de grille du modèle à ${formatDistanceMeters(wind.sampleDistanceMeters)}`
}

/** « il y a 3 min » pour un horodatage ISO ; « âge inconnu » sinon. */
export function ageOf(iso: string | null, nowMs: number): string {
  if (!iso) return 'jamais chargé'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'âge inconnu'
  return formatAge(Math.max(0, nowMs - t))
}
