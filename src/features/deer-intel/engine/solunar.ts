import type { MoonInfo } from './types'

export const SOLUNAR_RULE_IDS = ['EXP-SOLUNAR-01'] as const

/** Ampleur maximale de l'hypothèse (points d'indice) — choix de conception, pas un coefficient publié. */
export const SOLUNAR_MAX_DELTA = 6
/** Demi-largeur (minutes) autour d'un événement lunaire. */
export const SOLUNAR_HALF_WIDTH_MIN = 45

function taper(distanceMin: number): number {
  return Math.max(0, 1 - Math.abs(distanceMin) / SOLUNAR_HALF_WIDTH_MIN)
}

function nearest(at: Date, events: (Date | null)[]): number {
  let best = Infinity
  for (const e of events) {
    if (e) best = Math.min(best, Math.abs(at.getTime() - e.getTime()) / 60_000)
  }
  return best
}

/**
 * HYPOTHÈSE EXPÉRIMENTALE (opt-in) : direction de l'effet décrite par Sullivan et coll. 2016
 * (mâles adultes) — près de la nouvelle/pleine lune, activité plus probable au lever/coucher de la
 * lune et moins aux passages haut/bas ; hors de ces phases, aucune correction (rien n'est
 * documenté dans le dossier V2). D'autres travaux (MSU 2025,
 * Webb 2010) ne trouvent aucun effet : le résultat est contradictoire. Seule la direction est
 * reprise ; l'ampleur est bornée à ±SOLUNAR_MAX_DELTA et ne provient d'aucune publication.
 */
export function solunarDelta(at: Date, moon: MoonInfo): number {
  const nearNewOrFull =
    moon.illuminationFraction >= 0.85 || moon.illuminationFraction <= 0.15
  const riseSet = taper(nearest(at, [moon.rise, moon.set]))
  const transits = taper(nearest(at, [moon.upperTransit, moon.lowerTransit]))
  if (!nearNewOrFull) return 0
  const delta = SOLUNAR_MAX_DELTA * (riseSet - transits)
  return Math.max(-SOLUNAR_MAX_DELTA, Math.min(SOLUNAR_MAX_DELTA, delta))
}
