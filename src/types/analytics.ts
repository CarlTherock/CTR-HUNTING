import type { Coordinate } from './geo'
import type { DataConfidence } from './data-quality'

export type AnalyzerId = 'terrain' | 'vegetation' | 'weather' | 'wind' | 'time' | 'history'

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
}

/** Combined result across every analyzer that had data — an unweighted
 * plain average of whatever real scores exist (never inventing a score
 * for a missing analyzer to fill a weight), explicitly never presented
 * as more certain than its least-confident contributing analyzer. */
export interface CombinedAnalysis {
  overallScore: number | null
  results: AnalyzerResult[]
}

/** One real grid cell of a Phase 9 analysis heatmap — the same
 * `CombinedAnalysis` a single point-tap produces, computed for every
 * cell of a `buildGrid()` covering the visible map area. */
export interface AnalysisHeatmapCell {
  coordinate: Coordinate
  combined: CombinedAnalysis
}
