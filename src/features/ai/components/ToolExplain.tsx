import { useMemo, useState } from 'react'
import { useAnalysisStore } from '@/features/analytics/state/analysisStore'
import { useHeatmapStore } from '@/features/analytics/state/heatmapStore'
import { EmptyState } from '@/components/ui'
import { explainAnalysis } from '../explain'
import { buildExplainOptions } from '../explainSources'
import { CONTROL, Field } from './fields'
import { ResultView } from './ResultView'
import { ToolIntro } from './TaskResult'

/** « Expliquer une cellule ou une analyse » (déjà calculée). */
export function ToolExplain() {
  const cells = useHeatmapStore((s) => s.cells)
  const selectedCellIndex = useHeatmapStore((s) => s.selectedCellIndex)
  const lastSelectedCellIndex = useHeatmapStore((s) => s.lastSelectedCellIndex)
  const previousCellIndex = useHeatmapStore((s) => s.previousCellIndex)
  const hour = useHeatmapStore((s) => s.hour)
  const computedAt = useHeatmapStore((s) => s.computedAt)
  const computedBounds = useHeatmapStore((s) => s.computedBounds)
  const gridSize = useHeatmapStore((s) => s.gridSize)
  const pointCombined = useAnalysisStore((s) => s.combined)
  const pointCoordinate = useAnalysisStore((s) => s.coordinate)
  const recent = useAnalysisStore((s) => s.recent)

  const options = useMemo(
    () =>
      buildExplainOptions({
        cells,
        selectedCellIndex,
        lastSelectedCellIndex,
        previousCellIndex,
        hourLabel: hour?.timeLabel ?? null,
        computedAt,
        computedBounds,
        gridSize,
        point:
          pointCombined && pointCoordinate
            ? { coordinate: pointCoordinate, combined: pointCombined }
            : null,
        recent,
      }),
    [
      cells,
      selectedCellIndex,
      lastSelectedCellIndex,
      previousCellIndex,
      hour,
      computedAt,
      computedBounds,
      gridSize,
      pointCombined,
      pointCoordinate,
      recent,
    ],
  )

  const [chosen, setChosen] = useState<string>('')
  const [otherChosen, setOtherChosen] = useState<string>('')
  const primary = options.find((o) => o.key === chosen) ?? options[0]
  const other =
    otherChosen && otherChosen !== primary?.key
      ? options.find((o) => o.key === otherChosen)
      : undefined

  const result = useMemo(
    () =>
      primary
        ? explainAnalysis({ subject: primary.subject, other: other?.subject ?? null })
        : null,
    [primary, other],
  )

  if (options.length === 0 || !primary || !result) {
    return (
      <div className="flex flex-col gap-3">
        <ToolIntro>
          Explique une analyse déjà calculée : facteurs, poids, sources, heure, données
          manquantes et limites, et pourquoi deux cellules diffèrent.
        </ToolIntro>
        <EmptyState
          title="Aucune analyse à expliquer"
          description="Activez la carte de potentiel (page Carte, outil Analyse) et ouvrez une cellule, ou analysez un point. Revenez ensuite ici : rien n’est recalculé et aucune requête n’est faite."
        />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ToolIntro>
        Explique une analyse déjà calculée : facteurs, poids, sources, heure, données
        manquantes et limites. Choisissez une seconde analyse pour voir pourquoi les deux
        diffèrent.
      </ToolIntro>
      <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
        <Field label="Analyse à expliquer">
          {(id) => (
            <select
              id={id}
              className={CONTROL}
              value={primary.key}
              onChange={(e) => setChosen(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Comparer avec (facultatif)">
          {(id) => (
            <select
              id={id}
              className={CONTROL}
              value={other?.key ?? ''}
              onChange={(e) => setOtherChosen(e.target.value)}
            >
              <option value="">Aucune</option>
              {options
                .filter((o) => o.key !== primary.key)
                .map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.title}
                  </option>
                ))}
            </select>
          )}
        </Field>
      </div>
      <ResultView result={result} />
    </div>
  )
}
