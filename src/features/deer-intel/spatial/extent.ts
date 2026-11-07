import type { Coordinate } from '@/types'
import type { AnalysisExtent } from './types'

export const MIN_RADIUS_M = 300
export const MAX_RADIUS_M = 3000
export const DEFAULT_RADIUS_M = 1000

/**
 * Étendue ancrée sur un point GPS et un rayon. Elle ne dépend JAMAIS de la vue de la
 * carte (zoom ou déplacement) : même entrée, même étendue.
 */
export function createExtent(center: Coordinate, radiusM: number): AnalysisExtent {
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error('Coordonnées invalides.')
  }
  if (Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180) {
    throw new Error('Coordonnées hors limites.')
  }
  const r = Number.isFinite(radiusM) ? radiusM : DEFAULT_RADIUS_M
  return {
    center: { lat: center.lat, lng: center.lng },
    radiusM: Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(r))),
  }
}

/** Boîte englobante (sud, ouest, nord, est) de l'étendue. */
export function extentBounds(extent: AnalysisExtent): [number, number, number, number] {
  const dLat = extent.radiusM / 111_320
  const dLng = extent.radiusM / (111_320 * Math.cos((extent.center.lat * Math.PI) / 180))
  return [
    extent.center.lat - dLat,
    extent.center.lng - dLng,
    extent.center.lat + dLat,
    extent.center.lng + dLng,
  ]
}

export function extentKey(extent: AnalysisExtent): string {
  return `${extent.center.lat.toFixed(5)},${extent.center.lng.toFixed(5)}@${extent.radiusM}`
}
