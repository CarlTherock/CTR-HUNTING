import { cn } from '@/utils/cn'
import type { DayAnalysis } from '../engine'
import { dayLabel, windowLabel } from './format'

/** Comparaison des jours : même échelle 0–100 ; l'horizon météo réel est indiqué par jour. */
export function DayComparison({
  days,
  selected,
  onSelect,
}: {
  days: readonly DayAnalysis[]
  selected: number
  onSelect: (i: number) => void
}) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Comparaison des jours">
      {days.map((d, i) => {
        const top = d.windows[0]
        return (
          <li key={d.dateKey}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-pressed={i === selected}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-1.5 text-left text-sm',
                i === selected
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-surface-700 bg-surface-900',
              )}
            >
              <span className="text-ink-100 w-20 shrink-0 font-medium">
                {dayLabel(d.dateKey)}
              </span>
              <span className="bg-surface-800 h-2.5 min-w-0 flex-1 overflow-hidden rounded">
                {top && (
                  <span
                    className={cn(
                      'block h-full',
                      d.weatherCoverage === 'complete'
                        ? 'bg-brand-500'
                        : 'bg-brand-500/50',
                    )}
                    style={{ width: `${Math.round(top.meanIndex)}%` }}
                  />
                )}
              </span>
              <span className="text-ink-300 w-28 shrink-0 text-right text-xs tabular-nums">
                {top
                  ? `${windowLabel(top)} · ${Math.round(top.meanIndex)}`
                  : 'aucun créneau'}
              </span>
            </button>
            <p className="text-ink-600 px-1 text-[11px]">
              {d.weatherCoverage === 'complete'
                ? 'Météo disponible sur toute la plage.'
                : d.weatherCoverage === 'partielle'
                  ? 'Météo partielle (horizon de prévision dépassé en partie) : indice moins comparable.'
                  : 'Pas de météo ce jour-là : activité de référence seulement.'}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
