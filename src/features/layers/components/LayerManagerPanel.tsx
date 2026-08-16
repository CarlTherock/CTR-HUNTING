import { Layers as LayersIcon } from 'lucide-react'
import type { MapBaseLayerOption } from '@/types'
import { cn } from '@/utils/cn'
import { useLayersStore } from '../state/layersStore'

const BASE_LAYERS: MapBaseLayerOption[] = [
  { id: 'outdoor', label: 'Outdoor (topo)' },
  { id: 'satellite', label: 'Satellite' },
]

/** Floating panel over the map for choosing the active base layer. Only
 * base-layer selection exists yet — independently-toggleable overlays
 * (trails, hydrography, contours) are slice 1.4. */
export function LayerManagerPanel() {
  const baseLayer = useLayersStore((state) => state.baseLayer)
  const setBaseLayer = useLayersStore((state) => state.setBaseLayer)

  return (
    <div className="border-surface-600 bg-surface-900/90 absolute top-3 left-3 z-10 rounded-lg border p-2 shadow-lg backdrop-blur-sm">
      <div className="text-ink-500 mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold">
        <LayersIcon size={14} aria-hidden="true" />
        Base layer
      </div>
      <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Base layer">
        {BASE_LAYERS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={baseLayer === option.id}
            onClick={() => setBaseLayer(option.id)}
            className={cn(
              'rounded-md px-2 py-1.5 text-left text-sm transition-colors',
              baseLayer === option.id
                ? 'bg-brand-500/15 text-brand-400'
                : 'text-ink-300 hover:bg-surface-800 hover:text-ink-100',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
