import { QUEBEC_RINGS } from './quebecRings'
import type { Ring } from './quebecRings'

/**
 * Reconnaissance du territoire. Le contour est approximatif (voir quebecRings.ts) : tout point à
 * moins de `UNCERTAIN_MARGIN_KM` d'une limite est « incertain », jamais classé en silence. Les
 * limites avec les rivières et le fleuve comptent aussi comme limites : un point sur l'eau est
 * incertain, pas « hors Québec ».
 */
export const UNCERTAIN_MARGIN_KM = 15

export type TerritoryState =
  /** Dans le Québec continental, loin des limites. */
  | 'quebec'
  /** Proche d'une limite du contour : appartenance non établie. */
  | 'incertain'
  /** Île d'Anticosti : contexte distinct (références propres). */
  | 'anticosti'
  /** Îles-de-la-Madeleine : aucun repère documenté ici. */
  | 'madeleine'
  | 'hors_territoire'

export interface TerritoryResult {
  state: TerritoryState
  /** Distance au contour le plus proche (km), pour l'affichage et le diagnostic. */
  boundaryKm: number
}

const KM_PER_DEG = 111.32

function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

function segmentKm(
  lng: number,
  lat: number,
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const kx = KM_PER_DEG * Math.cos((lat * Math.PI) / 180)
  const px = (lng - a[0]) * kx
  const py = (lat - a[1]) * KM_PER_DEG
  const dx = (b[0] - a[0]) * kx
  const dy = (b[1] - a[1]) * KM_PER_DEG
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2))
  return Math.hypot(px - t * dx, py - t * dy)
}

function ringDistanceKm(lng: number, lat: number, ring: Ring): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const d = segmentKm(lng, lat, ring[i], ring[(i + 1) % ring.length])
    if (d < best) best = d
  }
  return best
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  )
}

export function classifyTerritory(lat: number, lng: number): TerritoryResult {
  if (!isValidCoordinate(lat, lng))
    return { state: 'hors_territoire', boundaryKm: Infinity }
  let boundaryKm = Infinity
  let insideKey: string | null = null
  for (const [key, ring] of Object.entries(QUEBEC_RINGS)) {
    boundaryKm = Math.min(boundaryKm, ringDistanceKm(lng, lat, ring))
    if (inRing(lng, lat, ring)) insideKey = key
  }
  if (insideKey === null) {
    return {
      state: boundaryKm <= UNCERTAIN_MARGIN_KM ? 'incertain' : 'hors_territoire',
      boundaryKm,
    }
  }
  // Une île a sa propre limite : la distance utile est celle de son anneau.
  const own = ringDistanceKm(lng, lat, QUEBEC_RINGS[insideKey])
  if (own <= UNCERTAIN_MARGIN_KM) return { state: 'incertain', boundaryKm: own }
  if (insideKey === 'anticosti') return { state: 'anticosti', boundaryKm: own }
  if (insideKey === 'madeleine') return { state: 'madeleine', boundaryKm: own }
  return { state: 'quebec', boundaryKm: own }
}

export interface ZoneResult {
  /** `null` : fuseau non établi — aucun horaire fiable à afficher. */
  timeZone: string | null
  note: string
}

/**
 * Fuseau d'un point SANS météo. Règle prudente : le Québec continental à l'ouest de 63,5° O suit
 * l'heure de l'Est ; plus à l'est (Basse-Côte-Nord, golfe) et aux Îles-de-la-Madeleine l'heure de
 * l'Atlantique s'applique par endroits, donc le fuseau reste non établi. Hors Québec : non établi
 * (la prévision du point le fournit lorsqu'elle est disponible). Jamais le fuseau du téléphone.
 */
export function resolveTimeZone(lat: number, lng: number): ZoneResult {
  const t = classifyTerritory(lat, lng)
  // À l'ouest de 69° O, tous les voisins du Québec (Ontario, New York, Vermont, New Hampshire,
  // Maine) sont à l'heure de l'Est : un point « incertain » (fleuve, frontière) y a le même fuseau.
  const eastern =
    (t.state === 'quebec' && lng <= -63.5) || (t.state === 'incertain' && lng <= -69)
  if (eastern)
    return {
      timeZone: 'America/Toronto',
      note: 'Fuseau déduit du territoire (heure de l’Est).',
    }
  if (t.state === 'quebec' || t.state === 'anticosti' || t.state === 'incertain')
    return {
      timeZone: null,
      note: 'Fuseau non établi à cet endroit sans prévision : certaines zones de l’est du Québec suivent l’heure de l’Atlantique.',
    }
  return {
    timeZone: null,
    note: 'Fuseau non établi sans prévision pour ce point : aucun horaire fiable.',
  }
}
