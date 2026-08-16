import { Layers as LayersIcon } from 'lucide-react'
import { availableBaseLayers } from '@/services/map'
import type { MapBaseLayerOption, MapOverlayOption } from '@/types'
import { cn } from '@/utils/cn'
import { useLayersStore } from '../state/layersStore'

const MAPTILER_LAYERS: MapBaseLayerOption[] = [
  { id: 'outdoor', label: 'Outdoor (topo)' },
  { id: 'satellite', label: 'Satellite' },
]

const ESRI_LAYERS: MapBaseLayerOption[] = [
  { id: 'esri-topographic', label: 'Topographic' },
  { id: 'esri-imagery', label: 'Imagery Hybrid' },
  { id: 'esri-imagery-standard', label: 'Imagery' },
  { id: 'esri-terrain', label: 'Terrain' },
  { id: 'esri-hillshade', label: 'Hillshade' },
  { id: 'esri-light-gray', label: 'Light Gray' },
  { id: 'esri-dark-gray', label: 'Dark Gray' },
  { id: 'esri-navigation', label: 'Navigation' },
]

const OVERLAYS: MapOverlayOption[] = [
  { id: 'trails', label: 'Trails' },
  { id: 'hydrography', label: 'Hydrography' },
  { id: 'contours', label: 'Contour lines' },
]

/** Floating panel over the map: base layer picker (grouped by vendor —
 * only options whose API key is actually configured, see
 * `services/map/index.ts`), plus overlay toggles (slice 1.4). Overlays
 * only exist inside MapTiler's "Outdoor" style — every other base layer
 * (MapTiler "Satellite", any Esri style) has no equivalent layers to show
 * or hide — so they're disabled rather than silently doing nothing. */
export function LayerManagerPanel() {
  const baseLayer = useLayersStore((state) => state.baseLayer)
  const setBaseLayer = useLayersStore((state) => state.setBaseLayer)
  const overlays = useLayersStore((state) => state.overlays)
  const toggleOverlay = useLayersStore((state) => state.toggleOverlay)
  const overlaysAvailable = baseLayer === 'outdoor'

  const mapTilerOptions = MAPTILER_LAYERS.filter((o) => availableBaseLayers.includes(o.id))
  const esriOptions = ESRI_LAYERS.filter((o) => availableBaseLayers.includes(o.id))

  return (
    <div className="border-surface-600 bg-surface-900/90 absolute top-3 left-3 z-10 max-h-[75vh] w-44 overflow-y-auto rounded-lg border p-2 shadow-lg backdrop-blur-sm">
      <div className="text-ink-500 mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold">
        <LayersIcon size={14} aria-hidden="true" />
        Base layer
      </div>
      <div role="radiogroup" aria-label="Base layer" className="flex flex-col gap-2.5">
        {mapTilerOptions.length > 0 && (
          <BaseLayerGroup
            title="MapTiler"
            options={mapTilerOptions}
            active={baseLayer}
            onSelect={setBaseLayer}
          />
        )}
        {esriOptions.length > 0 && (
          <BaseLayerGroup
            title="Esri"
            options={esriOptions}
            active={baseLayer}
            onSelect={setBaseLayer}
          />
        )}
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
              overlaysAvailable && 'text-ink-300 hover:bg-surface-800 hover:text-ink-100',
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

interface BaseLayerGroupProps {
  title: string
  options: MapBaseLayerOption[]
  active: string
  onSelect: (id: MapBaseLayerOption['id']) => void
}

function BaseLayerGroup({ title, options, active, onSelect }: BaseLayerGroupProps) {
  return (
    <div>
      <div className="text-ink-700 px-1 pb-0.5 text-[10px] font-semibold tracking-wide uppercase">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active === option.id}
            onClick={() => onSelect(option.id)}
            className={cn(
              'rounded-md px-2 py-1.5 text-left text-sm transition-colors',
              active === option.id
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
