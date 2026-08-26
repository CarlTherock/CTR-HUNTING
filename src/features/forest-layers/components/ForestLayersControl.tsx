import { useState } from 'react'
import { Trees, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { FOREST_LAYER_OPTIONS } from '@/services/map/forestLayerTiles'
import { useForestLayersStore } from '../state/forestLayersStore'

/**
 * Real Québec government reference layers — cadastre (land parcels),
 * coupes forestières (harvest/silviculture interventions), and
 * peuplements forestiers (ecoforestry stand composition/age), the same
 * "cadastre + coupes" layers Forêt ouverte's own map offers. Each is a
 * real WMS/ArcGIS overlay (`services/map/forestLayerTiles.ts`), not a
 * synthesized layer — toggled independently, any combination at once.
 */
export function ForestLayersControl() {
  const enabled = useForestLayersStore((state) => state.enabled)
  const opacity = useForestLayersStore((state) => state.opacity)
  const toggle = useForestLayersStore((state) => state.toggle)
  const setOpacity = useForestLayersStore((state) => state.setOpacity)

  const anyEnabled = Object.values(enabled).some(Boolean)
  // Separate from `enabled` (per-layer visibility) so closing the panel
  // never turns off already-toggled layers — same split as
  // `WindLayerControl`'s panel visibility vs. its layer toggle.
  const [panelOpen, setPanelOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        aria-pressed={panelOpen}
        title="Couches Forêt ouverte"
        aria-label="Toggle Forêt ouverte layers panel"
        className={cn(
          'border-surface-600 bg-surface-900/90 hover:bg-surface-800 absolute top-[55rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors',
          anyEnabled ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300',
        )}
      >
        <Trees size={18} aria-hidden="true" />
      </button>

      {panelOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900/95 w-full max-w-sm rounded-lg border p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Forêt ouverte</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Fermer"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {FOREST_LAYER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="switch"
                  aria-checked={!!enabled[option.id]}
                  onClick={() => toggle(option.id)}
                  className={cn(
                    'flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors',
                    enabled[option.id]
                      ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                      : 'border-surface-600 text-ink-300 hover:bg-surface-800',
                  )}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-ink-500 text-xs">{option.description}</span>
                </button>
              ))}
            </div>

            {anyEnabled && (
              <div className="mt-2">
                <label className="text-ink-500 flex items-center justify-between text-xs">
                  <span>Opacité</span>
                  <span>{Math.round(opacity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  aria-label="Opacité des couches"
                  className="accent-brand-500 w-full"
                />
              </div>
            )}

            <p className="text-ink-500 mt-2 text-[10px]">
              Données réelles © Gouvernement du Québec (Forêt ouverte / MRNF, cadastre) — CC-BY 4.0.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
