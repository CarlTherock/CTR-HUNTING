import type { ForestLayerOption, OverlayStatus } from '@/types'

export type NoticeTone = 'info' | 'warning' | 'error'

export interface LayerNotice {
  tone: NoticeTone
  text: string
}

/**
 * What the panel must say about one ENABLED layer right now: a failed load,
 * a "zoom in" hint when the service draws nothing at this zoom, or the
 * loading state. Pure so it can be tested without a map.
 */
export function layerNotice(
  option: ForestLayerOption,
  status: OverlayStatus | undefined,
  zoom: number,
): LayerNotice | null {
  if (status?.state === 'error') {
    return { tone: 'error', text: status.message ?? 'Chargement impossible.' }
  }
  if (option.minZoom !== undefined && zoom < option.minZoom) {
    return {
      tone: 'warning',
      text: `Rien n’est affiché à ce niveau de zoom : le service ne dessine cette couche qu’à partir d’environ le zoom ${option.minZoom}. Zoomez pour la voir.`,
    }
  }
  if (status?.state === 'loading') return { tone: 'info', text: 'Chargement…' }
  if (status?.state === 'ready') return { tone: 'info', text: 'Chargée.' }
  return null
}

/** Distinct attributions of the enabled layers, in panel order. */
export function enabledAttributions(
  options: ForestLayerOption[],
  enabled: Partial<Record<string, boolean>>,
): string[] {
  const seen = new Set<string>()
  for (const option of options) {
    if (enabled[option.id]) seen.add(option.attribution)
  }
  return [...seen]
}
