import type { ExplainSubject } from './explain'
import type { AnalysisHeatmapCell, CombinedAnalysis, Coordinate } from '@/types'
import { cellSizeMeters, formatCellMeters } from '@/utils/grid'
import type { LngLatBounds } from '@/utils/tiles'

/** Une analyse déjà calculée que l'on peut expliquer. */
export interface ExplainOption {
  key: string
  /** Libellé du sélecteur. */
  title: string
  subject: ExplainSubject
}

export interface ExplainSourceState {
  cells: readonly AnalysisHeatmapCell[]
  selectedCellIndex: number | null
  lastSelectedCellIndex: number | null
  previousCellIndex: number | null
  hourLabel: string | null
  computedAt: string | null
  computedBounds: LngLatBounds | null
  gridSize: number
  /** Analyse d'un point libre (hors carte de potentiel). */
  point: { coordinate: Coordinate; combined: CombinedAnalysis } | null
  recent: readonly { coordinate: Coordinate; combined: CombinedAnalysis }[]
}

function cellOption(
  state: ExplainSourceState,
  index: number,
  title: string,
): ExplainOption | null {
  const cell = state.cells[index]
  if (!cell) return null
  const sizeText = state.computedBounds
    ? (() => {
        const size = cellSizeMeters(state.computedBounds, state.gridSize)
        return `≈ ${formatCellMeters(size.widthMeters)} × ${formatCellMeters(size.heightMeters)}`
      })()
    : undefined
  return {
    key: `cell-${index}`,
    title,
    subject: {
      // L'étiquette ne contient pas de coordonnées : elles sont dans `coordinate`.
      ref: {
        kind: 'cell',
        id: `cell-${index}`,
        label: `Cellule ${index + 1}`,
        coordinate: { lat: cell.coordinate.lat, lng: cell.coordinate.lng },
      },
      combined: cell.combined,
      coordinate: cell.coordinate,
      hourLabel: state.hourLabel ?? undefined,
      computedAt: state.computedAt,
      sizeText,
    },
  }
}

/**
 * Analyses disponibles à expliquer, lues dans l'état déjà calculé : la
 * cellule ouverte (ou la dernière ouverte), la cellule précédente, le
 * dernier point analysé et les analyses récentes. Rien n'est recalculé ni
 * demandé à un fournisseur.
 */
export function buildExplainOptions(state: ExplainSourceState): ExplainOption[] {
  const options: ExplainOption[] = []
  const seen = new Set<string>()
  const push = (option: ExplainOption | null) => {
    if (option && !seen.has(option.key)) {
      seen.add(option.key)
      options.push(option)
    }
  }

  const current = state.selectedCellIndex ?? state.lastSelectedCellIndex
  if (current !== null) {
    push(
      cellOption(
        state,
        current,
        state.selectedCellIndex !== null
          ? `Cellule ouverte (n° ${current + 1})`
          : `Dernière cellule ouverte (n° ${current + 1})`,
      ),
    )
  }
  if (state.previousCellIndex !== null) {
    push(
      cellOption(
        state,
        state.previousCellIndex,
        `Cellule précédente (n° ${state.previousCellIndex + 1})`,
      ),
    )
  }
  if (state.point) {
    const { coordinate, combined } = state.point
    options.push({
      key: 'point-current',
      title: 'Dernier point analysé',
      subject: {
        ref: {
          kind: 'cell',
          id: 'point-current',
          label: 'Point analysé',
          coordinate: { lat: coordinate.lat, lng: coordinate.lng },
        },
        combined,
        coordinate,
      },
    })
  }
  state.recent.forEach((item, i) => {
    // La plus récente est le point courant : inutile de la lister deux fois.
    if (state.point && item.combined === state.point.combined) return
    options.push({
      key: `point-recent-${i}`,
      title: `Analyse récente n° ${i + 1}`,
      subject: {
        ref: {
          kind: 'cell',
          id: `point-recent-${i}`,
          label: `Analyse récente ${i + 1}`,
          coordinate: { lat: item.coordinate.lat, lng: item.coordinate.lng },
        },
        combined: item.combined,
        coordinate: item.coordinate,
      },
    })
  })
  return options
}
