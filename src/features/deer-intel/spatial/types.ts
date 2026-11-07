import type { Coordinate } from '@/types'

/** Étendue d'analyse ANCRÉE (point GPS + rayon), indépendante de la vue de la carte. */
export interface AnalysisExtent {
  center: Coordinate
  radiusM: number
}

export type LandClass =
  'forest' | 'agricultural' | 'open' | 'wetland' | 'water' | 'developed'

/** Un polygone d'occupation du sol (anneaux en lng/lat ; le 1er est l'extérieur). */
export interface LandPolygon {
  id: string
  landClass: LandClass
  rings: Coordinate[][]
}

export interface LandCoverData {
  polygons: LandPolygon[]
  source: string
  /** ISO — date de récupération des données. */
  fetchedAt: string
}

export type CellState = 'scored' | 'excluded' | 'unknown'

export interface GridCell {
  ix: number
  iy: number
  center: Coordinate
  landClass: LandClass | null
  state: CellState
  /** 0–100 ; `null` = pas de score (jamais 0 ni 50 par défaut). */
  score: number | null
  /** Distance (m) au plus proche milieu nourricier (agricole/ouvert), si connue. */
  foodDistanceM: number | null
}

export interface Sector {
  id: string
  rank: number
  /** Polygone GeoJSON-like : [extérieur, ...trous], en lng/lat. */
  rings: Coordinate[][]
  cellCount: number
  areaHa: number
  meanScore: number
  centroid: Coordinate
}

export type CandidateGrade = 'A' | 'B' | 'C'

export interface CandidatePoint {
  id: string
  grade: CandidateGrade
  score: number
  coordinate: Coordinate
  distanceFromCenterM: number
  sectorId: string | null
  reasons: string[]
  /** Données non intégrées qui limitent la lecture de ce point. */
  missing: string[]
}

export interface SpatialParams {
  extent: AnalysisExtent
  maxCandidates: number
  /** Distance minimale entre deux points candidats (m). */
  minSpacingM: number
  /** Anneaux à exclure (propriétés, zones interdites), en lng/lat. */
  exclusions: Coordinate[][]
}

export interface SpatialAnalysis {
  engineVersion: string
  extent: AnalysisExtent
  cellSizeM: number
  cellCount: number
  /** Part des cellules classées (0–1) : couverture des données, séparée du score. */
  coverage: number
  sectors: Sector[]
  candidates: CandidatePoint[]
  /** Corridors : jamais calculés tant qu'aucune méthode documentée n'est disponible. */
  corridors: { computed: false; reason: string }
  source: { name: string; fetchedAt: string } | null
  limits: string[]
}
