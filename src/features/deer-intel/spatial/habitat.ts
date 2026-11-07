import type { GridCell } from './types'

export const HABITAT_RULE_IDS = ['HAB-COVER-FOOD-01'] as const

export const FOOD_REACH_M = 400
export const COVER_BASE = 35

/** Heuristique comparative de couvert/proximité, non probabilité de présence. */
export function scoreHabitat(cells: GridCell[], width: number, cellSizeM: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isFinite(cellSizeM) || cellSizeM <= 0)
    throw new RangeError('Dimensions de grille invalides')

  const index = new Map<number, GridCell>()
  for (const c of cells) index.set(c.iy * width + c.ix, c)
  // Une clé linéaire seule peut confondre x = -1 avec la ligne précédente.
  const at = (x: number, y: number): GridCell | undefined => {
    if (x < 0 || x >= width || y < 0) return undefined
    return index.get(y * width + x)
  }
  const reachCells = Math.ceil(FOOD_REACH_M / cellSizeM)
  for (const c of cells) {
    c.score = null
    c.foodDistanceM = null
    if (c.landClass === 'water' || c.landClass === 'developed') {
      c.state = 'excluded'
      continue
    }
    if (c.landClass === null) {
      c.state = 'unknown'
      continue
    }
    c.state = 'scored'
    let best = Infinity
    for (let dy = -reachCells; dy <= reachCells; dy++) {
      for (let dx = -reachCells; dx <= reachCells; dx++) {
        const o = at(c.ix + dx, c.iy + dy)
        if (!o || (o.landClass !== 'agricultural' && o.landClass !== 'open')) continue
        best = Math.min(best, Math.hypot(dx, dy) * cellSizeM)
      }
    }
    c.foodDistanceM = Number.isFinite(best) ? Math.round(best) : null
    if (c.landClass === 'forest') {
      const prox = best <= FOOD_REACH_M ? 1 - best / FOOD_REACH_M : 0
      c.score = Math.round(COVER_BASE + (100 - COVER_BASE) * prox)
    } else if (c.landClass === 'wetland') {
      c.score = 30
    } else {
      let forestNear = Infinity
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const o = at(c.ix + dx, c.iy + dy)
          if (o?.landClass === 'forest')
            forestNear = Math.min(forestNear, Math.hypot(dx, dy))
        }
      c.score = Number.isFinite(forestNear) ? 45 : 15
    }
  }
}
