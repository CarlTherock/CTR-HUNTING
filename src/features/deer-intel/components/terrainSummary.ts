import type { SpatialAnalysis } from '../spatial/types'

/** Synthèse de résultats existants : aucun nouveau facteur biologique ni score inventé. */
export function terrainSummary(spatial: SpatialAnalysis | null) {
  const coverage = spatial && Number.isFinite(spatial.coverage) && spatial.coverage >= 0 && spatial.coverage <= 1 ? spatial.coverage : null
  const candidates = spatial && coverage !== 0 ? spatial.candidates.filter((c) => Number.isFinite(c.score) && c.score >= 50 && c.score <= 100 && Number.isFinite(c.coordinate.lat) && Math.abs(c.coordinate.lat) <= 90 && Number.isFinite(c.coordinate.lng) && Math.abs(c.coordinate.lng) <= 180).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)) : []
  const corridorResult = spatial?.corridors
  const corridors = corridorResult?.computed ? corridorResult.corridors : []
  return {
    coverage,
    topCandidates: candidates.slice(0, 3),
    candidateCount: candidates.length,
    sectorCount: spatial?.sectors.length ?? 0,
    corridorCount: corridors.length,
    robustPrincipalCount: corridors.filter((c) => c.kind === 'principal' && c.robustness === 'robuste').length,
    hasSpatial: spatial !== null,
    corridorsComputed: corridorResult?.computed === true,
    corridorReason: corridorResult && !corridorResult.computed ? corridorResult.reason : null,
  }
}
