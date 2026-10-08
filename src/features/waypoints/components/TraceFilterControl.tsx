import { Droplets, Route } from 'lucide-react'
import { ToolSlot } from '@/components/map-tools'
import { useTraceDisplayStore } from '../state/traceDisplayStore'
import { BLOOD_TRACK_COLOR, TRACK_FILTER_OPTIONS } from '../trackStyle'

/** Which recorded traces the map draws, with a legend that never relies on
 * colour alone (each kind has an icon and a label). */
export function TraceFilterControl() {
  const filter = useTraceDisplayStore((state) => state.filter)
  const setFilter = useTraceDisplayStore((state) => state.setFilter)
  return (
    <ToolSlot order={12}>
      <div className="border-surface-600 rounded-lg border px-3 py-2">
        <p className="text-ink-300 mb-1 text-xs">Traces affichées</p>
        <div
          role="radiogroup"
          aria-label="Traces affichées"
          className="flex flex-wrap gap-2"
        >
          {TRACK_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`min-h-11 rounded-lg border px-3 text-sm ${
                filter === option.value
                  ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                  : 'border-surface-600 text-ink-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-ink-300 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="flex items-center gap-1">
            <Droplets size={14} aria-hidden="true" style={{ color: BLOOD_TRACK_COLOR }} />
            Rouge : recherche de sang
          </span>
          <span className="flex items-center gap-1">
            <Route size={14} aria-hidden="true" />
            Autre couleur : trajet normal
          </span>
        </p>
      </div>
    </ToolSlot>
  )
}
