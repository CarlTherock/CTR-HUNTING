import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type {
  AnalysisFamily,
  AnalyzerResult,
  Coordinate,
  Observation,
  Track,
  VegetationSample,
  Waypoint,
  WaypointCategory,
  WindField,
  WindHourlyReading,
} from '@/types'
import type { HourKind } from '@/utils/analysisTime'

/**
 * Types du comparateur de caches. `CacheComparison` est le RÉSULTAT
 * STRUCTURÉ de `compareCaches()` : l'interface l'affiche, et la tranche
 * « assistant » le réutilisera tel quel (critères, valeurs, données
 * manquantes, avantages/inconvénients, ordre et raisons). Rien ici n'est un
 * score caché ni une prévision de réussite.
 */

// ---------------------------------------------------------------- critères

export type CriterionId =
  'wind-direction' | 'wind-speed' | 'precipitation' | 'habitat' | 'game-signs'

/** `not-evaluable` = la donnée manque : le critère ne compte NI pour NI
 * contre le point (il n'est jamais remplacé par une valeur neutre). */
export type CriterionStatus = 'met' | 'not-met' | 'not-evaluable'

/** Définition publique d'un critère : la règle est affichée telle quelle. */
export interface CriterionDefinition {
  id: CriterionId
  label: string
  /** Famille d'analyse (Habitat / Conditions / Observations). */
  family: AnalysisFamily
  /** Règle appliquée, en français, affichée à l'utilisateur. */
  rule: string
  /** Donnée requise pour pouvoir l'évaluer. */
  requires: string
}

/** Évaluation d'un critère pour UN point de repère. */
export interface CriterionEvaluation {
  id: CriterionId
  status: CriterionStatus
  /** Valeur évaluée (« Vent du O, 12 km/h »), `null` si non évaluable. */
  valueText: string | null
  /** Phrase expliquant le verdict (ou la donnée manquante). */
  detail: string
}

export interface Coverage {
  evaluable: number
  total: number
  /** « 4/5 critères évaluables » */
  text: string
  missing: CriterionId[]
}

// ----------------------------------------------------------- valeurs d'un point

export interface Unavailable {
  status: 'unavailable'
  reason: string
}

export interface WindValue {
  status: 'available'
  reading: WindHourlyReading
  /** Distance au point de grille du modèle (aucune interpolation). */
  sampleDistanceMeters: number
  /** Identifie le point de grille : deux points qui le partagent ont la
   * MÊME valeur de vent (le vent ne peut alors pas les départager). */
  sampleKey: string
  source: string
  /** Heure de la valeur (heure locale du modèle). */
  dataTime: string
  timeLabel: string
}

export interface WindPreference {
  directions: number[]
  /** `true` si le vent à l'heure choisie vient d'une direction préférée,
   * `false` sinon, `null` sans préférence enregistrée ou sans vent. */
  compatible: boolean | null
  note: string
}

export interface ConditionsValue {
  status: 'available'
  temperatureCelsius: number
  precipitationMm: number
  cloudCoverPercent: number
  /** `current` = l'heure en cours, `forecast` = future, `past` = écoulée. */
  timeKind: HourKind
  /** « Actuel (heure en cours, valeur horaire du modèle) », « Prévision pour 18:00 »… */
  timeLabel: string
  source: string
  dataTime: string
}

export interface HabitatValue {
  /** `informed` : au moins un groupe d'habitat a sa donnée. */
  state: 'informed' | 'not-informed'
  /** « Habitat renseigné : végétation (OpenStreetMap) » / « non renseigné ». */
  summary: string
  terrain: AnalyzerResult
  vegetation: AnalyzerResult
}

export interface NearbyRecord {
  id: string
  kind: 'waypoint' | 'journal'
  label: string
  distanceMeters: number | null
  category?: WaypointCategory
}

/** Les trois comptes sont SÉPARÉS : une visite n'est pas un signe de
 * gibier, et un signe de gibier n'est pas un animal observé. */
export interface ObservationsValue {
  radiusMeters: number
  /** Traces GPS passant dans le rayon (information : effort d'observation). */
  visits: { count: number; trackIds: string[] }
  /** Points de repère « indice de gibier », « site de récolte », « caméra »
   * dans le rayon (le point comparé lui-même est exclu). */
  gameSigns: { count: number; items: NearbyRecord[] }
  /** Entrées de journal proches ou liées au point (texte libre). */
  journalEntries: { count: number; items: NearbyRecord[] }
  /** Aucune donnée structurée « animal observé » n'existe dans l'application. */
  animalsObserved: { status: 'unavailable'; reason: string }
  analyzer: AnalyzerResult
}

export type PositionValue =
  | {
      status: 'available'
      distanceMeters: number
      accuracyMeters: number
      /** « relevé il y a 4 s » */
      ageText: string
    }
  | Unavailable

export interface DataAge {
  /** ISO : quand le vent a été chargé, `null` si jamais. */
  windFetchedAt: string | null
  vegetationFetchedAt: string | null
  recordsReadAt: string | null
  /** Heure de la valeur du modèle utilisée, si elle existe. */
  modelTime: string | null
}

// ------------------------------------------------------------------ résultat

export interface WaypointComparison {
  waypointId: string
  name: string
  category: WaypointCategory
  coordinate: Coordinate
  wind: WindValue | Unavailable
  windPreference: WindPreference
  conditions: ConditionsValue | Unavailable
  habitat: HabitatValue
  observations: ObservationsValue
  position: PositionValue
  dataAge: DataAge
  /** Toujours les 5 critères, dans l'ordre de `CacheComparison.criteria`. */
  criteria: CriterionEvaluation[]
  coverage: Coverage
  /** Données manquantes en français (liste lisible, jamais vide par oubli). */
  missingData: string[]
  advantages: string[]
  drawbacks: string[]
}

export interface RankEntry {
  waypointId: string
  /** 1 = meilleur ; les points à égalité partagent le même rang. */
  rank: number
  metCount: number
  /** Nombre de critères communs sur lesquels le tri s'appuie. */
  commonCount: number
  metCriteria: CriterionId[]
  unmetCriteria: CriterionId[]
  reasons: string[]
}

export type RankingStatus =
  /** Un ordre a été établi (au moins deux rangs différents). */
  | 'ranked'
  /** Comparables, mais identiques sur les critères communs : pas d'ordre. */
  | 'tied'
  /** Trop de données manquantes : on ne classe pas. */
  | 'not-comparable'

export interface Ranking {
  status: RankingStatus
  /** Phrase affichée : pourquoi un ordre, une égalité ou aucun classement. */
  summary: string
  /** Critères sur lesquels le tri s'appuie (évaluables pour TOUS les points classés). */
  commonCriteria: CriterionId[]
  /** Critères communs où les points classés diffèrent réellement. */
  differentiating: CriterionId[]
  /** Triés par rang puis par ordre de sélection ; vide si non comparable. */
  entries: RankEntry[]
  /** Points laissés hors classement, avec la raison. */
  excluded: { waypointId: string; reason: string }[]
}

export interface HourInfo {
  hourKey: string
  kind: HourKind
  label: string
}

export interface CacheComparison {
  hour: HourInfo
  criteria: CriterionDefinition[]
  /** Dans l'ordre de sélection. */
  rows: WaypointComparison[]
  ranking: Ranking
  /** Règles de tri, affichées telles quelles. */
  rules: string[]
  /** « Comparaison indicative : ce n'est pas une prévision de réussite. » */
  disclaimer: string
}

// -------------------------------------------------------------------- entrées

export type SourceState =
  | { status: 'ok'; fetchedAt: string }
  | { status: 'error'; reason: string }
  | { status: 'skipped'; reason: string }
  | { status: 'loading' }

export interface CompareRecords {
  /** TOUS les points de repère (pas seulement ceux du filtre de territoire). */
  waypoints: Waypoint[]
  tracks: Track[]
  observations: Observation[]
  readAt: string | null
}

export interface CompareCachesInput {
  /** 2 à 4 points choisis (en dehors, le classement est « non comparable »). */
  waypoints: Waypoint[]
  /** Heure locale `YYYY-MM-DDTHH:00` ; `null` = l'heure en cours. */
  hourKey: string | null
  now: Date
  windField: WindField | null
  wind: SourceState
  /** Échantillons de végétation (une grille OSM sur l'emprise). */
  vegetation: VegetationSample[] | null
  vegetationState: SourceState
  records: CompareRecords
  /** `null` = pas de lecture GPS. */
  gps: GeolocationReading | null
  nowMs: number
}
