import { useState } from 'react'
import { Layers as LayersIcon, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { availableBaseLayers } from '@/services/map'
import type { MapBaseLayerOption, MapOverlayOption } from '@/types'
import { cn } from '@/utils/cn'
import { useLayersStore } from '../state/layersStore'

const MAPTILER_LAYERS: MapBaseLayerOption[] = [
  { id: 'outdoor', label: 'Plein air (topo)' },
  { id: 'satellite', label: 'Satellite' },
]

const ESRI_LAYERS: MapBaseLayerOption[] = [
  { id: 'esri-topographic', label: 'Topographique' },
  { id: 'esri-imagery', label: 'Imagerie hybride' },
  { id: 'esri-imagery-standard', label: 'Imagerie' },
  { id: 'esri-terrain', label: 'Relief' },
  { id: 'esri-hillshade', label: 'Ombrage du relief' },
  { id: 'esri-light-gray', label: 'Gris clair' },
  { id: 'esri-dark-gray', label: 'Gris foncé' },
  { id: 'esri-navigation', label: 'Navigation' },
]

const OVERLAYS: MapOverlayOption[] = [
  { id: 'trails', label: 'Sentiers' },
  { id: 'hydrography', label: 'Hydrographie' },
  { id: 'contours', label: 'Courbes de niveau' },
]

/** Floating panel over the map: base layer picker (grouped by vendor —
 * only options whose API key is actually configured, see
 * `services/map/index.ts`), plus overlay toggles (slice 1.4). Overlays
 * only exist inside MapTiler's "Outdoor" style — every other base layer
 * (MapTiler "Satellite", any Esri style) has no equivalent layers to show
 * or hide — so they're disabled rather than silently doing nothing.
 *
 * Collapses to a small icon button once a base layer is picked, so the
 * (now fairly tall, 10-option) list doesn't keep covering most of the
 * map on a phone screen — reopen it to change layers again. Overlays
 * don't collapse it: those are more of a "flip a few, one at a time"
 * action than a single choice. */
export function LayerManagerPanel() {
  // Collapsed by default: a ten-option list must never cover the map at
  // startup. It is opened from the "Couches" button.
  const [isOpen, setIsOpen] = useState(false)
  const baseLayer = useLayersStore((state) => state.baseLayer)
  const setBaseLayer = useLayersStore((state) => state.setBaseLayer)
  const overlays = useLayersStore((state) => state.overlays)
  const toggleOverlay = useLayersStore((state) => state.toggleOverlay)
  const overlaysAvailable = baseLayer === 'outdoor'

  const mapTilerOptions = MAPTILER_LAYERS.filter((o) =>
    availableBaseLayers.includes(o.id),
  )
  const esriOptions = ESRI_LAYERS.filter((o) => availableBaseLayers.includes(o.id))

  function selectBaseLayer(id: MapBaseLayerOption['id']) {
    setBaseLayer(id)
    setIsOpen(false)
  }

  const trigger = (
    <ToolTrigger
      placement="rail"
      label="Couches"
      icon={<LayersIcon size={20} aria-hidden="true" />}
      onClick={() => setIsOpen((open) => !open)}
      pressed={isOpen}
      active={isOpen}
      order={40}
    />
  )

  if (!isOpen) return trigger

  return (
    <>
      {trigger}
      <div className="border-surface-600 bg-surface-900/95 absolute top-10 left-2 z-20 max-h-[calc(100%-3rem)] w-56 max-w-[calc(100%-4.5rem)] overflow-y-auto rounded-lg border p-2 shadow-lg backdrop-blur-sm">
        <div className="mb-1.5 flex items-center justify-between gap-1.5 px-1">
          <div className="text-ink-500 flex items-center gap-1.5 text-xs font-semibold">
            <LayersIcon size={14} aria-hidden="true" />
            Fond de carte
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            title="Fermer"
            aria-label="Fermer le panneau des couches"
            className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div
          role="radiogroup"
          aria-label="Fond de carte"
          className="flex flex-col gap-2.5"
        >
          {mapTilerOptions.length > 0 && (
            <BaseLayerGroup
              title="MapTiler"
              options={mapTilerOptions}
              active={baseLayer}
              onSelect={selectBaseLayer}
            />
          )}
          {esriOptions.length > 0 && (
            <BaseLayerGroup
              title="Esri"
              options={esriOptions}
              active={baseLayer}
              onSelect={selectBaseLayer}
            />
          )}
        </div>

        <div className="border-surface-700 text-ink-500 mt-2 mb-1.5 border-t px-1 pt-2 text-xs font-semibold">
          Superpositions
        </div>
        {!overlaysAvailable && (
          <p className="text-ink-500 px-1 pb-1.5 text-xs">
            Sentiers, hydrographie et courbes de niveau ne sont disponibles qu’avec le
            fond « Plein air (topo) ».
          </p>
        )}
        <div className="flex flex-col gap-0.5" role="group" aria-label="Superpositions">
          {OVERLAYS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="checkbox"
              aria-checked={overlays[option.id]}
              disabled={!overlaysAvailable}
              title={
                overlaysAvailable
                  ? undefined
                  : 'Disponible uniquement avec le fond Plein air'
              }
              onClick={() => toggleOverlay(option.id)}
              className={cn(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors pointer-coarse:min-h-11',
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
    </>
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
              'rounded-md px-2 py-1.5 text-left text-sm transition-colors pointer-coarse:min-h-11',
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
