import { SPATIAL_ENGINE_VERSION } from './version'
import { buildGrid } from './grid'
import { scoreHabitat } from './habitat'
import { buildSectors } from './sectors'
import { pickCandidates } from './candidates'
import { createExtent } from './extent'
import { computeCorridors, CORRIDOR_LIMITS } from './corridors'
import { buildSurvey } from './survey'
import type { LandCoverData, SpatialAnalysis, SpatialParams } from './types'
export const SPATIAL_LIMITS: string[] = [
  'Les secteurs et points candidats sont un classement comparatif de l’habitat d’après l’occupation du sol (OpenStreetMap) : ni une probabilité de présence du cerf, ni une trace observée.',
  'La pondération couvert / milieu nourricier est une heuristique de conception, non calibrée ni validée au Québec.',
  'Relief, pente, vent sous couvert, accès et pression de chasse ne sont pas intégrés.',
  'La précision dépend de la complétude d’OpenStreetMap ; une zone sans polygone est « sans donnée », jamais « peu favorable ».',
]
export function defaultSpatialParams(center: { lat: number; lng: number }, radiusM: number): SpatialParams {
  return { extent: createExtent(center, radiusM), maxCandidates: 5, minSpacingM: 150, exclusions: [] }
}
export function analyzeSpatial(params: SpatialParams, land: LandCoverData | null): SpatialAnalysis {
  const extent = createExtent(params.extent.center, params.extent.radiusM)
  const { cells, width, height, cellSizeM } = buildGrid(extent, land?.polygons ?? [])
  scoreHabitat(cells, width, cellSizeM)
  const sectors = buildSectors(extent, cellSizeM, cells)
  const limits = [...SPATIAL_LIMITS, ...CORRIDOR_LIMITS]
  if (!land) limits.unshift('Aucune donnée d’occupation du sol : aucun secteur n’est calculé.')
  return {
    engineVersion: SPATIAL_ENGINE_VERSION, extent, cellSizeM, cellCount: cells.length,
    coverage: cells.length ? cells.filter((c) => c.landClass !== null).length / cells.length : 0,
    survey: buildSurvey(extent, cellSizeM, cells), sectors,
    candidates: pickCandidates({ ...params, extent }, cells, sectors),
    corridors: computeCorridors({ cells, width, height, cellSizeM, radiusM: extent.radiusM }),
    source: land ? { name: land.source, fetchedAt: land.fetchedAt } : null, limits,
  }
}
