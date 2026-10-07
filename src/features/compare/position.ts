import { formatAge, gpsAgeMs, gpsFreshness } from '@/features/gps/gpsFreshness'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { haversineMeters } from '@/utils/geo'
import type { Coordinate } from '@/types'
import { MAX_GPS_ACCURACY_METERS } from './criteria'
import type { PositionValue } from './types'

/**
 * Distance à vol d'oiseau depuis la position de l'utilisateur — seulement
 * avec un fix FRAIS (≤ 15 s, voir `gpsFreshness`) et une précision connue
 * et acceptable (≤ `MAX_GPS_ACCURACY_METERS`). Sinon « position
 * indisponible » avec la raison : on ne calcule jamais une distance depuis
 * une position supposée, ancienne ou trop imprécise.
 */
export function positionFor(
  gps: GeolocationReading | null,
  nowMs: number,
  target: Coordinate,
): PositionValue {
  if (!gps) {
    return {
      status: 'unavailable',
      reason: 'Position indisponible : aucune lecture GPS.',
    }
  }
  if (gps.status === 'unavailable') {
    return { status: 'unavailable', reason: `Position indisponible : ${gps.reason}` }
  }
  const fix = gps.value
  const freshness = gpsFreshness(nowMs, fix.timestampMs)
  if (freshness !== 'recent') {
    return {
      status: 'unavailable',
      reason: `Position indisponible : dernier relevé GPS non frais (${formatAge(gpsAgeMs(nowMs, fix.timestampMs))}).`,
    }
  }
  const accuracy = fix.accuracyMeters
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy)) {
    return {
      status: 'unavailable',
      reason: 'Position indisponible : précision du GPS inconnue.',
    }
  }
  if (accuracy > MAX_GPS_ACCURACY_METERS) {
    return {
      status: 'unavailable',
      reason: `Position indisponible : précision insuffisante (±${Math.round(accuracy)} m, maximum ±${MAX_GPS_ACCURACY_METERS} m).`,
    }
  }
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng)) {
    return {
      status: 'unavailable',
      reason: 'Position indisponible : relevé GPS invalide.',
    }
  }
  return {
    status: 'available',
    distanceMeters: haversineMeters(fix, target),
    accuracyMeters: accuracy,
    ageText: `relevé ${formatAge(gpsAgeMs(nowMs, fix.timestampMs))}`,
  }
}
