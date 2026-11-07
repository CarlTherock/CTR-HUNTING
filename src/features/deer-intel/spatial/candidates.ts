import type { Coordinate } from '@/types'
import { haversineM, pointInPolygon, pointInRing } from './geo'
import { MAX_CANDIDATES_CAP } from './constants'
import type { CandidatePoint, GridCell, Sector, SpatialParams } from './types'

/** Seuils ABSOLUS des rangs (même échelle pour toute analyse). */
export const GRADE_A = 75
export const GRADE_B = 60
export const MIN_CANDIDATE_SCORE = 50

const MISSING = [
  'Relief, pente et exposition non intégrés',
  'Vent sous couvert et courants locaux non évalués',
  'Accès et pression de chasse non mesurés',
  'Aucune observation utilisée (journal, repères, traces)',
]

function gradeOf(score: number): CandidatePoint['grade'] {
  return score >= GRADE_A ? 'A' : score >= GRADE_B ? 'B' : 'C'
}

function inAnyRing(point: Coordinate, rings: readonly Coordinate[][]): boolean {
  return rings.some((r) => pointInRing(point, r))
}

/**
 * Points candidats : meilleures cellules notées, espacées d'au moins minSpacingM, jamais sur
 * l'eau, le bâti ni une zone exclue. Un rang A/B/C est comparatif, pas une probabilité.
 */
export function pickCandidates(
  params: SpatialParams,
  cells: GridCell[],
  sectors: readonly Sector[],
): CandidatePoint[] {
  const limit = Math.max(0, Math.min(MAX_CANDIDATES_CAP, Math.floor(params.maxCandidates)))
  const pool = cells.filter((c) => c.score !== null && c.score >= MIN_CANDIDATE_SCORE && !inAnyRing(c.center, params.exclusions))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.iy - b.iy || a.ix - b.ix)
  const picked: CandidatePoint[] = []
  for (const c of pool) {
    if (picked.length >= limit) break
    if (picked.some((p) => haversineM(p.coordinate, c.center) < params.minSpacingM)) continue
    const score = c.score as number
    const reasons: string[] = []
    if (c.landClass === 'forest') reasons.push('Couvert forestier')
    if (c.landClass === 'wetland') reasons.push('Milieu humide')
    if (c.landClass === 'agricultural' || c.landClass === 'open') reasons.push('Lisière d’un milieu ouvert')
    if (c.foodDistanceM !== null && c.landClass === 'forest') reasons.push(`Milieu nourricier (champ, ouvert) à environ ${c.foodDistanceM} m`)
    const sector = sectors.find((s) => pointInPolygon(c.center, s.rings))
    picked.push({
      id: `P${picked.length + 1}`, grade: gradeOf(score), score, coordinate: c.center,
      distanceFromCenterM: Math.round(haversineM(params.extent.center, c.center)),
      sectorId: sector?.id ?? null, reasons, missing: MISSING,
    })
  }
  return picked
}
