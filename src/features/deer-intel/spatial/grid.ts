import type { Coordinate } from '@/types'
import { bboxOf, haversineM, makeProjection, pointInPolygon } from './geo'
import type { AnalysisExtent, GridCell, LandClass, LandPolygon } from './types'

export const MAX_CELLS = 3600
export const MIN_CELL_M = 30

/** Taille de cellule : fine, mais bornée pour limiter le calcul (≤ MAX_CELLS cellules). */
export function cellSizeFor(radiusM: number): number {
  const side = Math.ceil((2 * radiusM) / Math.sqrt(MAX_CELLS))
  return Math.max(MIN_CELL_M, Math.ceil(side / 10) * 10)
}

/** Priorité si plusieurs polygones couvrent un même point : l'eau et le bâti l'emportent. */
const PRIORITY: Record<LandClass, number> = {
  water: 6,
  developed: 5,
  wetland: 4,
  forest: 3,
  agricultural: 2,
  open: 1,
}

/** Cellules (rond inscrit dans le carré) classées d'après les polygones fournis. */
export function buildGrid(
  extent: AnalysisExtent,
  polygons: readonly LandPolygon[],
): { cells: GridCell[]; width: number; height: number; cellSizeM: number } {
  const cellSizeM = cellSizeFor(extent.radiusM)
  const n = Math.ceil((2 * extent.radiusM) / cellSizeM)
  const proj = makeProjection(extent.center)
  const prepared = polygons.map((p) => ({ p, box: bboxOf(p.rings) }))
  const cells: GridCell[] = []
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -extent.radiusM + (ix + 0.5) * cellSizeM
      const y = extent.radiusM - (iy + 0.5) * cellSizeM
      if (Math.hypot(x, y) > extent.radiusM) continue
      const center = proj.toCoordinate(x, y)
      let best: LandClass | null = null
      for (const { p, box } of prepared) {
        if (
          center.lat < box.minLat ||
          center.lat > box.maxLat ||
          center.lng < box.minLng ||
          center.lng > box.maxLng
        )
          continue
        if (!pointInPolygon(center, p.rings)) continue
        if (best === null || PRIORITY[p.landClass] > PRIORITY[best]) best = p.landClass
      }
      cells.push({
        ix,
        iy,
        center,
        landClass: best,
        state: best === null ? 'unknown' : 'scored',
        score: null,
        foodDistanceM: null,
      })
    }
  }
  return { cells, width: n, height: n, cellSizeM }
}

export function cellCorners(
  extent: AnalysisExtent,
  cellSizeM: number,
  ix: number,
  iy: number,
): { nw: Coordinate; ne: Coordinate; se: Coordinate; sw: Coordinate } {
  const proj = makeProjection(extent.center)
  const x0 = -extent.radiusM + ix * cellSizeM
  const y0 = extent.radiusM - iy * cellSizeM
  return {
    nw: proj.toCoordinate(x0, y0),
    ne: proj.toCoordinate(x0 + cellSizeM, y0),
    se: proj.toCoordinate(x0 + cellSizeM, y0 - cellSizeM),
    sw: proj.toCoordinate(x0, y0 - cellSizeM),
  }
}

export { haversineM }
