import { useState } from 'react'
import { RefreshCw, Trees, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { cn } from '@/utils/cn'
import {
  FOREST_LAYER_OPTIONS,
  OFFICIAL_HUNTING_LINKS,
  WARNING_FRONTIERE,
} from '@/services/map/forestLayerTiles'
import { MAX_LAYER_RETRIES, isRetryableKind } from '@/services/map/layerErrors'
import type { ForestLayerGroup, ForestLayerId } from '@/types'
import { effectiveOpacity, useForestLayersStore } from '../state/forestLayersStore'
import { enabledAttributions, layerNotice } from '../utils/layerNotices'

const GROUPS: { id: ForestLayerGroup; title: string }[] = [
  { id: 'foret', title: 'Forêt et propriété' },
  { id: 'relief', title: 'Relief LiDAR' },
  { id: 'frontieres', title: 'Frontières (territoires)' },
]

const TONE_CLASS = {
  info: 'text-ink-500',
  warning: 'text-amber-400',
  error: 'text-red-400',
} as const

/**
 * Real Québec government reference layers — see `docs/SOURCES_QUEBEC.md`
 * for what was verified for each. Each is a real WMS/ArcGIS overlay
 * (`services/map/forestLayerTiles.ts`), not a synthesized layer — toggled
 * independently, any combination at once, each with its own opacity so the
 * LiDAR relief can be compared with the satellite view underneath.
 */
export function ForestLayersControl({
  currentZoom,
  onRetry,
}: {
  currentZoom: number
  /** Asks the map engine to request this layer's tiles again. */
  onRetry?: (id: ForestLayerId) => void
}) {
  const enabled = useForestLayersStore((state) => state.enabled)
  const opacity = useForestLayersStore((state) => state.opacity)
  const layerOpacity = useForestLayersStore((state) => state.layerOpacity)
  const status = useForestLayersStore((state) => state.status)
  const retries = useForestLayersStore((state) => state.retries)
  const noteRetry = useForestLayersStore((state) => state.noteRetry)
  const toggle = useForestLayersStore((state) => state.toggle)
  const setLayerOpacity = useForestLayersStore((state) => state.setLayerOpacity)

  const anyEnabled = Object.values(enabled).some(Boolean)
  const anyLegalEnabled = FOREST_LAYER_OPTIONS.some(
    (option) => option.legalBoundary && enabled[option.id],
  )
  const attributions = enabledAttributions(FOREST_LAYER_OPTIONS, enabled)
  // Separate from `enabled` (per-layer visibility) so closing the panel
  // never turns off already-toggled layers — same split as
  // `WeatherMapControl`'s panel visibility vs. its layer toggle.
  const [panelOpen, setPanelOpen] = useState(false)
  const inGroup = (id: ForestLayerGroup) =>
    FOREST_LAYER_OPTIONS.filter((option) => option.group === id)
  const activeCount = (id: ForestLayerGroup) =>
    inGroup(id).filter((option) => enabled[option.id]).length
  const groupActive = (id: ForestLayerGroup) => activeCount(id) > 0

  return (
    <>
      <ToolTrigger
        label="Couches du Québec (forêt, LiDAR, territoires)"
        icon={<Trees size={18} aria-hidden="true" />}
        onClick={() => setPanelOpen((open) => !open)}
        pressed={panelOpen}
        active={anyEnabled}
        order={50}
      />

      {panelOpen && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 flex justify-center">
          <div
            role="dialog"
            aria-label="Couches du Québec"
            className="border-surface-600 bg-surface-900/95 pointer-events-auto max-h-[min(60dvh,28rem)] w-full max-w-sm overflow-y-auto rounded-lg border p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Couches du Québec</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Fermer"
                className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {GROUPS.map((group) => (
              <details
                key={group.id}
                open={groupActive(group.id)}
                className="mb-2 [&>summary]:list-none"
              >
                <summary className="text-ink-300 flex min-h-11 cursor-pointer items-center justify-between text-xs font-semibold uppercase">
                  <span>{group.title}</span>
                  <span className="text-ink-500 normal-case">
                    {activeCount(group.id)} active(s)
                  </span>
                </summary>
                <div className="flex flex-col gap-1.5">
                  {FOREST_LAYER_OPTIONS.filter((option) => option.group === group.id).map(
                    (option) => {
                      const on = !!enabled[option.id]
                      const notice = on
                        ? layerNotice(option, status[option.id], currentZoom)
                        : null
                      const value = effectiveOpacity({ opacity, layerOpacity }, option.id)
                      return (
                        <div key={option.id}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            onClick={() => toggle(option.id)}
                            className={cn(
                              'flex w-full flex-col items-start rounded-md border px-2.5 py-1.5 text-left transition-colors pointer-coarse:min-h-11',
                              on
                                ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                                : 'border-surface-600 text-ink-300 hover:bg-surface-800',
                            )}
                          >
                            <span className="text-sm font-medium">{option.label}</span>
                            <span className="text-ink-500 text-xs">
                              {option.description}
                            </span>
                            <span className="text-ink-500 mt-0.5 text-[10px]">
                              {on ? 'Active · ' : ''}Réseau requis (pas hors ligne)
                            </span>
                          </button>

                          {on && (
                            <div className="mt-1 px-1">
                              {notice && (
                                <p
                                  role={notice.tone === 'error' ? 'alert' : 'status'}
                                  className={cn('mb-1 text-xs', TONE_CLASS[notice.tone])}
                                >
                                  {notice.text}
                                </p>
                              )}
                              {status[option.id]?.state === 'error' &&
                                isRetryableKind(status[option.id]?.errorKind) &&
                                (retries[option.id] ?? 0) < MAX_LAYER_RETRIES && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      noteRetry(option.id)
                                      onRetry?.(option.id)
                                    }}
                                    className="border-surface-600 text-ink-100 hover:bg-surface-800 mb-1 flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 text-xs"
                                  >
                                    <RefreshCw size={13} aria-hidden="true" />
                                    Réessayer
                                  </button>
                                )}
                              {status[option.id]?.state === 'error' &&
                                (retries[option.id] ?? 0) >= MAX_LAYER_RETRIES && (
                                  <p className="text-ink-500 mb-1 text-xs">
                                    Plusieurs essais ont échoué : réessayez plus tard ou
                                    désactivez la couche. La carte reste utilisable.
                                  </p>
                                )}
                              <label className="text-ink-500 flex items-center justify-between text-xs">
                                <span>Opacité (comparer avec le fond)</span>
                                <span>{Math.round(value * 100)} %</span>
                              </label>
                              <input
                                type="range"
                                min={0.1}
                                max={1}
                                step={0.05}
                                value={value}
                                onChange={(e) =>
                                  setLayerOpacity(option.id, Number(e.target.value))
                                }
                                aria-label={`Opacité : ${option.label}`}
                                className="accent-brand-500 w-full"
                              />
                              {option.legend && (
                                <p className="text-ink-500 mt-1 text-[11px]">
                                  Légende : {option.legend}
                                </p>
                              )}
                              <p className="text-ink-500 mt-1 text-[11px]">
                                {option.dataNote}
                              </p>
                              <p className="text-ink-500 mt-1 text-[11px]">
                                Licence {option.license} ·{' '}
                                <a
                                  href={option.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-brand-400 underline"
                                >
                                  Source officielle
                                </a>
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    },
                  )}
                </div>
              </details>
            ))}

            {anyLegalEnabled && (
              <div
                role="note"
                className="mb-2 rounded-md border border-amber-400/60 bg-amber-400/10 p-2 text-xs text-amber-200"
              >
                <p className="font-semibold">{WARNING_FRONTIERE}</p>
                <p className="mt-1">
                  Ces limites sont indicatives (les diffuseurs ne garantissent pas leur
                  exactitude). Consultez l’information officielle :
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {OFFICIAL_HUNTING_LINKS.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-ink-500 text-[11px]">
              Hors ligne : ces couches ne sont pas incluses dans le téléchargement de zone
              (conditions de mise en cache des services non établies) ; elles exigent une
              connexion.
            </p>
            {attributions.length > 0 && (
              <details className="text-ink-500 mt-1 text-[10px]">
                <summary className="min-h-11 cursor-pointer py-2">
                  Sources et attributions ({attributions.length})
                </summary>
                <p>Données : {attributions.join(' ; ')}.</p>
              </details>
            )}
          </div>
        </div>
      )}
    </>
  )
}
