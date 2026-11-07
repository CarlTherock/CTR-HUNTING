import { ENGINE_VERSION } from '../engine/types'
import { buildGrid } from './grid'
import { scoreHabitat } from './habitat'
import { buildSectors } from './sectors'
import { pickCandidates } from './candidates'
import { createExtent } from './extent'
import type { LandCoverData, SpatialAnalysis, SpatialParams } from './types'

export const SPATIAL_LIMITS: string[] = [
  'Les secteurs et points candidats sont un classement comparatif de l’habitat d’après l’occupation du sol (OpenStreetMap) : ni une probabilité de présence du cerf, ni une trace observée.',
  'La pondération couvert / milieu nourricier est une heuristique de conception, non calibrée ni validée au Québec.',
  'Relief, pente, vent sous couvert, accès et pression de chasse ne sont pas intégrés.',
  'La précision dépend de la complétude d’OpenStreetMap ; une zone sans polygone est « sans donnée », jamais « peu favorable ».',
]

export const CORRIDOR_REASON =
  'Corridors non calculés : aucune méthode documentée n’est disponible (le guide québécois 2013, p. 30 et 33, n’a pas pu être récupéré) et une grille d’habitat ne montre pas où le cerf passe réellement.'

export function defaultSpatialParams(
  center: { lat: number; lng: number },
  radiusM: number,
): SpatialParams {
  return {
    extent: createExtent(center, radiusM),
    maxCandidates: 5,
    minSpacingM: 150,
    exclusions: [],
  }
}

/** Analyse spatiale pure : mêmes entrées → mêmes sorties, indépendante de la vue de la carte. */
export function analyzeSpatial(
  params: SpatialParams,
  land: LandCoverData | null,
): SpatialAnalysis {
  const extent = createExtent(params.extent.center, params.extent.radiusM)
  const polygons = land?.polygons ?? []
  const { cells, width, cellSizeM } = buildGrid(extent, polygons)
  scoreHabitat(cells, width, cellSizeM)
  const classed = cells.filter((c) => c.landClass !== null).length
  const sectors = buildSectors(extent, cellSizeM, cells)
  const candidates = pickCandidates({ ...params, extent }, cells, sectors)
  const limits = [...SPATIAL_LIMITS]
  if (!land)
    limits.unshift('Aucune donnée d’occupation du sol : aucun secteur n’est calculé.')
  return {
    engineVersion: ENGINE_VERSION,
    extent,
    cellSizeM,
    cellCount: cells.length,
    coverage: cells.length === 0 ? 0 : classed / cells.length,
    sectors,
    candidates,
    corridors: { computed: false, reason: CORRIDOR_REASON },
    source: land ? { name: land.source, fetchedAt: land.fetchedAt } : null,
    limits,
  }
}
