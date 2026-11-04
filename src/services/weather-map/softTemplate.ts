import type { GeoMetLayerDef } from './GeoMetProvider'

/**
 * « Rendu doux » of the radar tiles. GeoMet draws a 1 km grid with 14 flat
 * colours, so zoomed in each cell shows as a block. Soft tiles are blurred by a
 * fraction of a cell before they are drawn (see `softTiles.ts`). Chosen over the
 * raw cells and a stronger blur after trying all three on a phone.
 */

/** Custom MapLibre protocol of the soft tiles. */
export const SOFT_TILE_PROTOCOL = 'ctrsoft'

/** Blur radius in output pixels of a 512 px tile (≈ 0,4 km at zoom 8). */
export const SOFT_BLUR_RADIUS = 3

/** Layers drawn as colour areas whose cells show as blocks. Pressure is
 * contour lines (blurring would only smear them). */
const SOFT_LAYERS = new Set(['radar', 'precipitation'])

export function isSoftLayer(def: Pick<GeoMetLayerDef, 'id'>): boolean {
  return SOFT_LAYERS.has(def.id)
}

/** Routes a GeoMet GetMap template through the soft-tile protocol. */
export function softTileTemplate(template: string): string {
  return template.replace(/^https?:\/\//, `${SOFT_TILE_PROTOCOL}://`)
}
