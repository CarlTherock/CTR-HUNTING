import { Card } from '@/components/ui'
import { CATEGORY_LABEL } from '@/features/waypoints/categories'
import { useIsWide } from '../useIsWide'
import type { CacheComparison } from '../types'
import { CompareActions } from './CompareActions'
import { buildSections } from './CompareSections'

interface CompareResultsProps {
  comparison: CacheComparison
  nowMs: number
  observationsFor: string | null
  onShowObservations: (waypointId: string) => void
}

/** Cartes empilées sur petit écran (aucune colonne illisible), tableau
 * comparatif sur grand écran — le tableau défile dans son propre cadre, jamais
 * la page. Un seul des deux est monté à la fois. */
export function CompareResults({
  comparison,
  nowMs,
  observationsFor,
  onShowObservations,
}: CompareResultsProps) {
  const wide = useIsWide()
  const sections = buildSections(comparison, nowMs)

  if (!wide) {
    return (
      <div className="flex flex-col gap-4" data-testid="compare-cards">
        {comparison.rows.map((row) => (
          <Card
            key={row.waypointId}
            className="flex flex-col gap-3 p-4"
            role="article"
            aria-label={`Comparaison : ${row.name}`}
          >
            <header className="min-w-0">
              <h3 className="text-ink-100 text-base font-semibold break-words">
                {row.name}
              </h3>
              <p className="text-ink-500 text-xs">{CATEGORY_LABEL[row.category]}</p>
            </header>
            <dl className="flex flex-col gap-3">
              {sections.map((section) => (
                <div
                  key={section.key}
                  className="border-surface-800 flex min-w-0 flex-col gap-1 border-t pt-3 text-sm"
                >
                  <dt className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
                    {section.label}
                  </dt>
                  <dd className="text-ink-300 min-w-0 break-words">
                    {section.render(row)}
                  </dd>
                </div>
              ))}
            </dl>
            <CompareActions
              row={row}
              observationsOpen={observationsFor === row.waypointId}
              onShowObservations={onShowObservations}
            />
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div
      className="border-surface-700 max-w-full overflow-x-auto rounded-md border"
      data-testid="compare-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Tableau comparatif (défile horizontalement)"
    >
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">
          Comparaison de {comparison.rows.length} points de repère pour{' '}
          {comparison.hour.label}
        </caption>
        <thead>
          <tr className="bg-surface-900">
            <th scope="col" className="text-ink-500 w-40 p-3 text-xs font-semibold">
              Critère
            </th>
            {comparison.rows.map((row) => (
              <th
                key={row.waypointId}
                scope="col"
                className="text-ink-100 border-surface-700 border-l p-3 align-top font-semibold break-words"
              >
                {row.name}
                <span className="text-ink-500 block text-xs font-normal">
                  {CATEGORY_LABEL[row.category]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <tr key={section.key} className="border-surface-700 border-t align-top">
              <th scope="row" className="text-ink-500 p-3 text-xs font-semibold">
                {section.label}
              </th>
              {comparison.rows.map((row) => (
                <td
                  key={row.waypointId}
                  className="text-ink-300 border-surface-700 border-l p-3 break-words"
                >
                  {section.render(row)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-surface-700 border-t align-top">
            <th scope="row" className="text-ink-500 p-3 text-xs font-semibold">
              Actions
            </th>
            {comparison.rows.map((row) => (
              <td key={row.waypointId} className="border-surface-700 border-l p-3">
                <CompareActions
                  row={row}
                  observationsOpen={observationsFor === row.waypointId}
                  onShowObservations={onShowObservations}
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
