import { Check } from 'lucide-react'
import { GEOMET_LAYERS } from '@/services/weather-map'
import { cn } from '@/utils/cn'
import type { WeatherMapLayerId } from '@/types'
import { LAYER_GROUPS, LAYER_PRESENTATION } from '../layerPresentation'

/** « Couches » : one row per real layer — icon, name, short description and
 * an unmistakable selected state (check mark + border, not colour alone). */
export function LayerList({
  active,
  onSelect,
}: {
  active: WeatherMapLayerId
  onSelect: (id: WeatherMapLayerId) => void
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Couche météo">
      {LAYER_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="text-ink-500 mb-1 text-[11px] font-semibold tracking-wide uppercase">
            {group.title}
          </p>
          <ul className="flex flex-col gap-1">
            {group.ids.map((id) => {
              const layer = GEOMET_LAYERS.find((l) => l.id === id)
              if (!layer) return null
              const { icon: Icon, description } = LAYER_PRESENTATION[id]
              const selected = id === active
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={layer.label}
                    aria-describedby={`wm-layer-desc-${id}`}
                    onClick={() => onSelect(id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors pointer-coarse:min-h-11',
                      selected
                        ? 'border-brand-400 bg-brand-500/20'
                        : 'border-surface-700 hover:bg-surface-800',
                    )}
                  >
                    <Icon
                      size={20}
                      aria-hidden="true"
                      className={selected ? 'text-brand-300' : 'text-ink-300'}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm font-medium',
                          selected ? 'text-brand-300' : 'text-ink-100',
                        )}
                      >
                        {layer.label}
                      </span>
                      <span
                        id={`wm-layer-desc-${id}`}
                        className="text-ink-500 block text-xs"
                      >
                        {description}
                      </span>
                    </span>
                    {selected && (
                      <Check size={16} aria-hidden="true" className="text-brand-300" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
