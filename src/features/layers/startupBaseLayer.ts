import type { MapBaseLayerId } from '@/types'

/**
 * Base layer the map opens with, in order of preference:
 *
 *  1. Esri "Imagery Hybrid" (satellite imagery + roads and place names) —
 *     the most useful view in the field;
 *  2. MapTiler "Satellite" — also imagery, used when no Esri key exists;
 *  3. whatever else has a key, so the map never starts on a style whose
 *     vendor key is missing.
 *
 * Returns `null` when no provider is configured at all (the page then shows
 * its explicit "carte indisponible" state).
 */
const STARTUP_PREFERENCE: readonly MapBaseLayerId[] = ['esri-imagery', 'satellite']

export function chooseStartupBaseLayer(
  available: readonly MapBaseLayerId[],
): MapBaseLayerId | null {
  for (const layer of STARTUP_PREFERENCE) {
    if (available.includes(layer)) return layer
  }
  return available[0] ?? null
}

/**
 * Layer to use when the map is (re)created. A layer the user picked during
 * this session wins as long as it is still available; otherwise the startup
 * default applies — so an old or implicit "outdoor" never overrides the
 * hybrid satellite default.
 */
export function resolveInitialBaseLayer(
  available: readonly MapBaseLayerId[],
  current: MapBaseLayerId,
  chosenByUser: boolean,
): MapBaseLayerId {
  if (chosenByUser && available.includes(current)) return current
  return chooseStartupBaseLayer(available) ?? current
}

const LAYER_LABEL: Partial<Record<MapBaseLayerId, string>> = {
  'esri-imagery': 'Imagerie hybride',
  satellite: 'Satellite',
  outdoor: 'Extérieur',
}

function labelOf(layer: MapBaseLayerId): string {
  return LAYER_LABEL[layer] ?? layer
}

/**
 * Message shown when the map does NOT open on the hybrid view because the
 * provider is not configured. `null` when the hybrid view is in use.
 */
export function startupFallbackNotice(
  available: readonly MapBaseLayerId[],
  chosen: MapBaseLayerId,
): string | null {
  if (chosen === 'esri-imagery') return null
  const reason = available.includes('esri-imagery')
    ? ''
    : 'la clé Esri n’est pas configurée'
  return `Imagerie hybride indisponible (${reason}) : fond « ${labelOf(chosen)} » affiché.`
}

/**
 * Next layer to try when the startup layer's resources (style JSON, key)
 * could not be loaded. Follows the same preference order as the startup
 * choice and never returns a layer that already failed. `null` = nothing
 * left to try: the caller must say so instead of leaving a blank map.
 */
export function nextFallbackLayer(
  available: readonly MapBaseLayerId[],
  failed: readonly MapBaseLayerId[],
): MapBaseLayerId | null {
  const candidates = available.filter((layer) => !failed.includes(layer))
  return chooseStartupBaseLayer(candidates)
}

/** Message for a base layer whose style could not be loaded. */
export function baseLayerFailureNotice(
  failed: MapBaseLayerId,
  fallback: MapBaseLayerId | null,
): string {
  return fallback
    ? `Fond « ${labelOf(failed)} » indisponible (réseau, clé ou ressource absente) : repli sur « ${labelOf(fallback)} ».`
    : `Fond « ${labelOf(failed)} » indisponible (réseau, clé ou ressource absente). Aucun autre fond ne peut être chargé pour le moment.`
}
