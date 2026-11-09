import { describe, expect, it } from 'vitest'
import { terrainSummary } from './terrainSummary'
import { analyzeSpatial, defaultSpatialParams } from '../spatial/analyzeSpatial'
import type { CandidatePoint } from '../spatial/types'

const emptySpatial = () => analyzeSpatial(defaultSpatialParams({ lat: 45.6, lng: -72 }, 500), null)
function point(id: string, score: number): CandidatePoint {
  return { id, score, grade: 'B', coordinate: { lat: 45.6, lng: -72 }, distanceFromCenterM: 100, sectorId: null, reasons: ['Couvert forestier'], missing: ['Relief non intégré'] }
}

describe('synthèse terrain intégrée', () => {
  it('ne fabrique pas de couverture en absence de données', () => {
    const summary = terrainSummary(null)
    expect(summary.hasSpatial).toBe(false)
    expect(summary.coverage).toBeNull()
    expect(summary.topCandidates).toEqual([])
  })
  it('sépare couverture nulle et mauvais habitat', () => {
    const summary = terrainSummary({ ...emptySpatial(), coverage: 0, candidates: [point('P1', 70)] })
    expect(summary.coverage).toBe(0)
    expect(summary.topCandidates).toEqual([])
  })
  it('conserve une couverture invalide comme indisponible', () => {
    for (const coverage of [NaN, -1, 1.1, Infinity]) expect(terrainSummary({ ...emptySpatial(), coverage }).coverage).toBeNull()
  })
  it('classe les points sans modifier le tableau source et limite à trois', () => {
    const candidates = [point('P2', 70), point('P3', 80), point('P1', 70), point('P4', 60)]
    const summary = terrainSummary({ ...emptySpatial(), coverage: 0.5, candidates })
    expect(summary.topCandidates.map((c) => c.id)).toEqual(['P3', 'P1', 'P2'])
    expect(summary.candidateCount).toBe(4)
    expect(candidates.map((c) => c.id)).toEqual(['P2', 'P3', 'P1', 'P4'])
  })
  it('écarte les indices et coordonnées invalides sans valeur de repli', () => {
    const invalid = { ...point('GPS', 70), coordinate: { lat: 91, lng: -72 } }
    const summary = terrainSummary({ ...emptySpatial(), coverage: 0.5, candidates: [point('NaN', NaN), point('Low', 49), point('High', 101), invalid, point('OK', 60)] })
    expect(summary.topCandidates.map((c) => c.id)).toEqual(['OK'])
  })
  it('ne présente pas un corridor alternatif comme principal robuste', () => {
    const spatial = emptySpatial()
    spatial.corridors = { computed: true, label: 'Hypothèses', cores: [], corridors: [
      { id: 'C1', kind: 'principal', fromCore: 0, toCore: 1, path: [], lengthM: 100, cost: 100, robustness: 'robuste', overlapWithBase: 0.8 },
      { id: 'C2', kind: 'alternative', fromCore: 0, toCore: 1, path: [], lengthM: 120, cost: 150, robustness: 'non_evalue', overlapWithBase: 0.3 },
    ], contactIndexMPerHa: null, contactLengthM: 0, notes: [] }
    const summary = terrainSummary(spatial)
    expect(summary.corridorCount).toBe(2)
    expect(summary.robustPrincipalCount).toBe(1)
  })
})
