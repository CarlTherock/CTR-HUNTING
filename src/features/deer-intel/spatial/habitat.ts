import type { GridCell } from './types'

export const HABITAT_RULE_IDS = ['HAB-COVER-FOOD-01'] as const

/** Distance (m) au-delà de laquelle la proximité d'un milieu nourricier ne compte plus. */
export const FOOD_REACH_M = 400
/** Plancher d'un couvert forestier sans milieu nourricier connu à portée. */
export const COVER_BASE = 35

/**
 * HEURISTIQUE DE CONCEPTION (catégorie D) : un secteur est d'autant plus intéressant que le couvert
 * forestier est proche d'un milieu nourricier (champ, milieu ouvert). Idée qualitative inspirée de la
 * distinction ressource / abri (Massé et Côté 2013 ; Courbin et coll. 2017, hivers d'Anticosti) —
 * ce n'est ni un modèle ajusté ni une probabilité de présence. Les pondérations sont choisies.
 * Les cellules sans donnée gardent un score `null` (jamais 0 ni 50) ; eau et bâti sont exclus.
 */
export function scoreHabitat(cells: GridCell[], width: number, cellSizeM: number): void {
  const index = new Map<number, GridCell>()
  for (const c of cells) index.set(c.iy * width + c.ix, c)
  const reachCells = Math.ceil(FOOD_REACH_M / cellSizeM)
  for (const c of cells) {
    if (c.landClass === 'water' || c.landClass === 'developed') {
      c.state = 'excluded'
      continue
    }
    if (c.landClass === null) continue
    // Distance au milieu nourricier le plus proche, cherchée dans une fenêtre bornée.
    let best = Infinity
    for (let dy = -reachCells; dy <= reachCells; dy++) {
      for (let dx = -reachCells; dx <= reachCells; dx++) {
        const o = index.get((c.iy + dy) * width + (c.ix + dx))
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
      // Milieu nourricier lui-même : intéressant seulement s'il touche un couvert (lisière).
      let forestNear = Infinity
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const o = index.get((c.iy + dy) * width + (c.ix + dx))
          if (o?.landClass === 'forest')
            forestNear = Math.min(forestNear, Math.hypot(dx, dy))
        }
      c.score = Number.isFinite(forestNear) ? 45 : 15
    }
  }
}
