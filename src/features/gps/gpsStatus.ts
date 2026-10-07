import { formatAge, gpsAgeMs, gpsFreshness } from './gpsFreshness'
import type { GeolocationReading } from './useGeolocation'

export type GpsStateLabel =
  'Recherche…' | 'Disponible' | 'Ancien' | 'Refusé' | 'Indisponible'

export interface GpsStatusView {
  label: GpsStateLabel
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  /** True only for a fix that may be shared as a snapshot (available, not stale). */
  shareable: boolean
  /** "Précision ±N m", or an explicit "inconnue" — never a made-up number. */
  accuracyText: string | null
  /** "relevé il y a N s" */
  ageText: string | null
  /** Reason for an unavailable reading. */
  reason: string | null
  /** Extra warning for an old / stale fix. */
  warning: string | null
}

/** Pure mapping from a reading (+ clock) to what the UI says about it. */
export function gpsStatusView(reading: GeolocationReading, nowMs: number): GpsStatusView {
  if (reading.status === 'unavailable') {
    const label: GpsStateLabel =
      reading.kind === 'searching'
        ? 'Recherche…'
        : reading.kind === 'denied'
          ? 'Refusé'
          : 'Indisponible'
    return {
      label,
      tone: label === 'Recherche…' ? 'neutral' : 'danger',
      shareable: false,
      accuracyText: null,
      ageText: null,
      reason: reading.reason,
      warning: null,
    }
  }
  const { value } = reading
  const freshness = gpsFreshness(nowMs, value.timestampMs)
  const accuracy = value.accuracyMeters
  return {
    label: freshness === 'recent' ? 'Disponible' : 'Ancien',
    tone: freshness === 'recent' ? 'success' : 'warning',
    shareable: freshness !== 'stale',
    accuracyText:
      typeof accuracy === 'number' && Number.isFinite(accuracy)
        ? `Précision ±${Math.round(accuracy)} m`
        : 'Précision inconnue',
    ageText: `relevé ${formatAge(gpsAgeMs(nowMs, value.timestampMs))}`,
    reason: null,
    warning:
      freshness === 'stale'
        ? 'Ce relevé est trop ancien pour être partagé.'
        : freshness === 'old'
          ? 'Ce relevé n’est plus récent : la position a pu changer.'
          : null,
  }
}
