import {
  ANALYZER_IDS,
  FAMILY_ORDER,
  isCovered,
  isPartiallyInformed,
} from '@/utils/analysisFamilies'
import type { HeatmapView } from './state/heatmapStore'
import type {
  AnalysisCoverage,
  AnalysisFamily,
  AnalysisHeatmapCell,
  AnalyzerId,
} from '@/types'

function isFamily(view: HeatmapView): view is AnalysisFamily {
  return (FAMILY_ORDER as readonly string[]).includes(view)
}

function isAnalyzer(view: HeatmapView): view is AnalyzerId {
  return (ANALYZER_IDS as readonly string[]).includes(view)
}

/**
 * Projette les cellules déjà calculées sur la vue choisie (indice
 * combiné, famille ou analyseur seul) et marque ce que la couche doit
 * dessiner autrement :
 * - `overallScore === null` → « sans donnée » (motif), JAMAIS une couleur
 *   « peu favorable » ;
 * - `partial` → cellule partiellement renseignée (hachurée) ;
 * - `selected` → cellule ouverte dans la fiche.
 * Pure : aucune donnée n'est ajoutée, aucun contraste n'est étiré.
 */
export function projectHeatmapCells(
  cells: AnalysisHeatmapCell[],
  view: HeatmapView,
  selectedIndex: number | null,
): AnalysisHeatmapCell[] {
  return cells.map((cell, index) => {
    let score = cell.combined.overallScore
    let coverage: AnalysisCoverage | undefined = cell.combined.coverage
    if (isFamily(view)) {
      const family = cell.combined.families?.find((f) => f.family === view)
      score = family?.score ?? null
      coverage = family?.coverage
    } else if (isAnalyzer(view)) {
      const result = cell.combined.results.find((r) => r.analyzer === view)
      score = result?.score ?? null
      coverage = {
        available: result && isCovered(result) ? 1 : 0,
        total: 1,
        missing: result && isCovered(result) ? [] : [view],
      }
    }
    return {
      ...cell,
      combined: { ...cell.combined, overallScore: score, coverage },
      partial: score !== null && coverage ? isPartiallyInformed(coverage) : false,
      selected: index === selectedIndex,
    }
  })
}
