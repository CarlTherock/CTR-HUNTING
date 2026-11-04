import type { GeoMetLayerDef } from './GeoMetProvider'

/**
 * « Rendu » of the radar tiles. GeoMet draws a 1 km grid with 14 flat colours,
 * so zoomed in each cell shows as a block. `doux` / `tres-doux` blur the tile
 * by a fraction of a cell before it is drawn (see `softTiles.ts`); `precis`
 * shows GeoMet's tile untouched.
 */
export type RadarSmoothing = 'precis' | 'doux' | 'tres-doux'

export const DEFAULT_RADAR_SMOOTHING: RadarSmoothing = 'doux'

export const RADAR_SMOOTHING_LABEL: Record<RadarSmoothing, string> = {
  precis: 'Précis',
  doux: 'Doux',
  'tres-doux': 'Très doux',
}

/** Custom MapLibre protocol and blur radius (output pixels of a 512 px tile,
 * ≈ 0,4 km and ≈ 0,9 km at zoom 8) of each soft level. */
export const SOFT_LEVELS = {
  doux: { protocol: 'ctrsoft', radius: 3 },
  'tres-doux': { protocol: 'ctrsoftx', radius: 6 },
} as const

export function parseRadarSmoothing(value: unknown): RadarSmoothing {
  if (value === 'precis' || value === 'doux' || value === 'tres-doux') return value
  // Earlier version stored an on/off switch.
  if (value === false) return 'precis'
  return DEFAULT_RADAR_SMOOTHING
}

/** Layers drawn as colour areas whose cells show as blocks. Pressure is
 * contour lines (blurring would only smear them). */
const SOFT_LAYERS = new Set(['radar', 'precipitation'])

export function isSoftLayer(def: Pick<GeoMetLayerDef, 'id'>): boolean {
  return SOFT_LAYERS.has(def.id)
}

/** Routes a GeoMet GetMap template through the soft-tile protocol of `level`
 * (unchanged for `precis`). */
export function softTileTemplate(template: string, level: RadarSmoothing): string {
  if (level === 'precis') return template
  return template.replace(/^https?:\/\//, `${SOFT_LEVELS[level].protocol}://`)
}
