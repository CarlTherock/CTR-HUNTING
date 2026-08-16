import { Layers as LayersIcon } from 'lucide-react'
import type { MapBaseLayerOption, MapOverlayOption } from '@/types'
import { cn } from '@/utils/cn'
import { useLayersStore } from '../state/layersStore'

const BASE_LAYERS: MapBaseLayerOption[] = [
  { id: 'outdoor', label: 'Outdoor (topo)' },
  { id: 'satellite', label: 'Satellite' },
]

const OVERLAYS: MapOverlayOption[] = [
  { id: 'trails', label: 'Trails' },
  { id: 'hydrography', label: 'Hydrography' },
  { id: 'contours', label: 'Contour lines' },
]

/** Floating panel over the map: base layer picker, plus overlay toggles
 * (slice 1.4). Overlays only exist inside the "Outdoor" style — MapTiler's
 * "Satellite" style has no equivalent layers to show or hide — so they're
 * disabled rather than silently doing nothing while Satellite is active. */
export function LayerManagerPanel() {
  const baseLayer = useLayersStore((state) => state.baseLayer)
  const setBaseLayer = useLayersStore((state) => state.setBaseLayer)
  const overlays = useLayersStore((state) => state.overlays)
  const toggleOverlay = useLayersStore((state) => state.toggleOverlay)
  const overlaysAvailable = baseLayer === 'outdoor'

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

      <div className="border-surface-700 text-ink-500 mt-2 mb-1.5 border-t px-1 pt-2 text-xs font-semibold">
        Overlays
      </div>
      <div className="flex flex-col gap-0.5" role="group" aria-label="Overlays">
        {OVERLAYS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="checkbox"
            aria-checked={overlays[option.id]}
            disabled={!overlaysAvailable}
            title={overlaysAvailable ? undefined : 'Only available on the Outdoor base layer'}
            onClick={() => toggleOverlay(option.id)}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
              !overlaysAvailable && 'text-ink-700 cursor-not-allowed',
              overlaysAvailable &&
                'text-ink-300 hover:bg-surface-800 hover:text-ink-100',
            )}
          >
            <span
              className={cn(
                'h-3.5 w-3.5 shrink-0 rounded-sm border',
                overlays[option.id] && overlaysAvailable
                  ? 'bg-brand-500 border-brand-500'
                  : 'border-surface-500',
              )}
            />
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
