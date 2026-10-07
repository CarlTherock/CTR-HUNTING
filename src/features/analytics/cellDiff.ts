import { analyzeCellAtHour } from './heatmapEngine'
import type { CellStatic, HourOptions, HourlyInputs } from './heatmapEngine'
import type { HourSelection } from '@/utils/analysisTime'
import type {
  AnalysisFactor,
  AnalysisFamily,
  AnalyzerId,
  CombinedAnalysis,
} from '@/types'

/**
 * Comparaisons PURES entre deux analyses déjà calculées (deux cellules, ou
 * une même cellule à deux heures). Elles n'ajoutent aucune donnée : elles
 * ne font que soustraire des facteurs que l'on peut déjà lire dans la
 * fiche, pour répondre à « pourquoi ces deux-là diffèrent-elles ? ».
 */

export interface FactorDelta {
  analyzer: AnalyzerId
  label: string
  /** Contribution dans A / B ; `null` = ce facteur ne s'applique pas. */
  a: number | null
  b: number | null
  delta: number
}

export interface FamilyDelta {
  family: AnalysisFamily
  a: number | null
  b: number | null
  /** `null` quand l'un des deux côtés n'a pas de score. */
  delta: number | null
}

export interface AnalysisDifference {
  overall: { a: number | null; b: number | null; delta: number | null }
  families: FamilyDelta[]
  /** Facteurs comptés qui diffèrent, du plus influent au moins influent. */
  differing: FactorDelta[]
  /** Facteurs identiques des deux côtés parce qu'ils s'appliquent à toute
   * la zone (météo au centre, moment) : ils NE peuvent PAS expliquer
   * l'écart. */
  sharedUniform: string[]
  /** Groupes dont un seul côté a la donnée. */
  coverageDiffers: AnalyzerId[]
}

function key(analyzer: AnalyzerId, label: string): string {
  return `${analyzer}::${label}`
}

function countedFactors(analysis: CombinedAnalysis) {
  const map = new Map<string, { analyzer: AnalyzerId; factor: AnalysisFactor }>()
  for (const result of analysis.results) {
    for (const factor of result.factors) {
      if (factor.scored === false) continue
      map.set(key(result.analyzer, factor.label), { analyzer: result.analyzer, factor })
    }
  }
  return map
}

function delta(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b
}

export function diffAnalyses(
  a: CombinedAnalysis,
  b: CombinedAnalysis,
): AnalysisDifference {
  const fa = countedFactors(a)
  const fb = countedFactors(b)
  const keys = new Set([...fa.keys(), ...fb.keys()])

  const differing: FactorDelta[] = []
  const sharedUniform: string[] = []
  for (const k of keys) {
    const left = fa.get(k)
    const right = fb.get(k)
    const ca = left?.factor.contribution ?? null
    const cb = right?.factor.contribution ?? null
    const reference = left ?? right
    if (!reference) continue
    if (ca === cb) {
      if (reference.factor.uniformAcrossArea) sharedUniform.push(reference.factor.label)
      continue
    }
    differing.push({
      analyzer: reference.analyzer,
      label: reference.factor.label,
      a: ca,
      b: cb,
      delta: (ca ?? 0) - (cb ?? 0),
    })
  }
  differing.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))

  const familiesA = a.families ?? []
  const familiesB = b.families ?? []
  const families: FamilyDelta[] = familiesA.map((fam) => {
    const other = familiesB.find((f) => f.family === fam.family)
    return {
      family: fam.family,
      a: fam.score,
      b: other?.score ?? null,
      delta: delta(fam.score, other?.score ?? null),
    }
  })

  const scoreOf = (analysis: CombinedAnalysis, id: AnalyzerId) =>
    analysis.results.find((r) => r.analyzer === id)?.score ?? null
  const coverageDiffers = a.results
    .map((r) => r.analyzer)
    .filter((id) => (scoreOf(a, id) === null) !== (scoreOf(b, id) === null))

  return {
    overall: {
      a: a.overallScore,
      b: b.overallScore,
      delta: delta(a.overallScore, b.overallScore),
    },
    families,
    differing,
    sharedUniform,
    coverageDiffers,
  }
}

export interface SlotComparison {
  a: CombinedAnalysis
  b: CombinedAnalysis
  difference: AnalysisDifference
}

/**
 * Compare UNE cellule à deux créneaux horaires, à partir du vent et de la
 * météo déjà chargés : aucune requête, aucune extrapolation (une heure
 * absente des données donne un analyseur « indisponible », pas une valeur).
 */
export function compareSlots(
  statics: CellStatic,
  hourA: HourSelection,
  hourB: HourSelection,
  inputs: HourlyInputs,
  options: HourOptions = {},
): SlotComparison {
  const a = analyzeCellAtHour(statics, hourA, inputs, options).combined
  const b = analyzeCellAtHour(statics, hourB, inputs, options).combined
  return { a, b, difference: diffAnalyses(a, b) }
}
