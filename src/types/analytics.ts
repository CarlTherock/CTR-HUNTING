import type { Coordinate } from './geo'
import type { DataConfidence } from './data-quality'

export type AnalyzerId =
  'terrain' | 'vegetation' | 'weather' | 'wind' | 'time' | 'history'

/**
 * Les trois familles de facteurs, volontairement séparées :
 * - `habitat` : terrain + végétation (relativement stable dans le temps) ;
 * - `conditions` : vent + météo à l'heure choisie, et le moment
 *   solaire/lunaire (indice populaire non vérifié) ;
 * - `observations` : vos propres données enregistrées (waypoints, traces,
 *   journal) — jamais mélangées silencieusement à l'habitat.
 */
export type AnalysisFamily = 'habitat' | 'conditions' | 'observations'

/** Nature temporelle d'un facteur : relevé actuel, prévision, heure passée
 * (valeur de modèle, pas une observation), donnée statique, ou
 * enregistrement personnel. */
export type FactorTimeKind = 'current' | 'forecast' | 'past' | 'static' | 'record'

/**
 * One real input's contribution to an analyzer's score — the mechanism
 * that keeps every result explainable (a hard project rule): a score
 * alone is never shown without the factors that produced it.
 */
export interface AnalysisFactor {
  label: string
  /** -1 (hurts the score) to 1 (helps it), 0 = neutral/informational. */
  contribution: number
  explanation: string
  confidence: DataConfidence
  // --- Métadonnées d'explicabilité (toutes optionnelles : rétro-compatible) ---
  family?: AnalysisFamily
  /** Poids relatif dans la moyenne de l'analyseur (défaut 1 : moyenne
   * simple). Affiché tel quel, jamais caché. */
  weight?: number
  /** `false` = information affichée mais NON comptée dans le score (par
   * ex. visites / exposition). Défaut : compté. */
  scored?: boolean
  /** Source de la donnée (nom lisible). */
  source?: string
  /** Date/heure de la donnée (chaîne ISO ou heure locale `YYYY-MM-DDTHH:mm`). */
  dataTime?: string
  timeKind?: FactorTimeKind
  /** Étiquette prête à afficher : « actuel », « prévision pour 18:00 »… */
  timeLabel?: string
  /** Échelle spatiale de la donnée en mètres (espacement d'échantillonnage
   * ou diamètre d'agrégation). `null` = valeur d'un seul point. */
  resolutionMeters?: number | null
  /** `true` : la même valeur s'applique à toute la zone analysée (ex. météo
   * demandée au centre) — ne peut donc pas expliquer une différence entre
   * deux cellules. */
  uniformAcrossArea?: boolean
  /** Indice populaire non vérifié scientifiquement. */
  unverified?: boolean
  /** Limites connues de cette source / règle. */
  limits?: string
}

/**
 * An analyzer's output for one location/time. `score` is `null` — never
 * a guessed number — when there isn't enough real data to produce one.
 * `confidence` reflects the *weakest* link among the factors that did
 * contribute (e.g. one estimated factor caps the whole result at
 * `estimated`, even if other factors were `measured`).
 */
export interface AnalyzerResult {
  analyzer: AnalyzerId
  score: number | null // 0-100
  confidence: DataConfidence | 'unavailable'
  factors: AnalysisFactor[]
  unavailableReason?: string
  family?: AnalysisFamily
  /** `true` quand la donnée d'entrée existait et a été évaluée (même si
   * aucune règle ne s'est déclenchée, donc `score === null`) ; `false`
   * quand la donnée manque. Sert à la couverture, pas au score. */
  covered?: boolean
  /** Pourquoi il n'y a pas de score alors que la donnée était présente. */
  noSignalReason?: string
}

/** Couverture : combien de groupes de facteurs ont leur donnée. */
export interface AnalysisCoverage {
  available: number
  total: number
  missing: AnalyzerId[]
}

/** Résumé d'une famille : moyenne simple des analyseurs de la famille qui
 * ont un score (règle affichée), ou `null` sans signal. */
export interface FamilyResult {
  family: AnalysisFamily
  score: number | null
  analyzers: AnalyzerId[]
  coverage: AnalysisCoverage
}

/** Combined result across every analyzer that had data — an unweighted
 * plain average of whatever real scores exist (never inventing a score
 * for a missing analyzer to fill a weight), explicitly never presented
 * as more certain than its least-confident contributing analyzer. */
export interface CombinedAnalysis {
  /** Indice de repère comparatif 0-100 — JAMAIS une probabilité de
   * présence, de déplacement ou de récolte. */
  overallScore: number | null
  results: AnalyzerResult[]
  families?: FamilyResult[]
  coverage?: AnalysisCoverage
}

/** One real grid cell of a Phase 9 analysis heatmap — the same
 * `CombinedAnalysis` a single point-tap produces, computed for every
 * cell of a `buildGrid()` covering the visible map area. */
export interface AnalysisHeatmapCell {
  coordinate: Coordinate
  combined: CombinedAnalysis
  /** Cellule actuellement ouverte dans la fiche (contour sur la carte). */
  selected?: boolean
  /** Cellule partiellement renseignée (hachurée sur la carte). */
  partial?: boolean
}
