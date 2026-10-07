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
