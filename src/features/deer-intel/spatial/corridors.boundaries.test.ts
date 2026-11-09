import { describe, expect, it } from 'vitest'
import { contactIndex, findCores, leastCost, computeCorridors, RESISTANCE_SCENARIOS } from './corridors'
import type { GridCell, LandClass } from './types'

function cell(ix: number, iy: number, landClass: LandClass = 'forest'): GridCell {
  return { ix, iy, center: { lat: 45 + iy / 1000, lng: -72 + ix / 1000 }, landClass, state: 'scored', score: 70, foodDistanceM: null }
}
function graph(cells: GridCell[], width = 6, height = 2) {
  return { cells, width, height, cellSizeM: 100, index: new Map(cells.map((c, i) => [c.iy * width + c.ix, i])) }
}

describe('limites de grille des corridors', () => {
  it('ne relie pas le bord droit au début de la ligne suivante', () => {
    const g = graph([cell(5, 0), cell(0, 1)])
    expect(leastCost(g, RESISTANCE_SCENARIOS.base, [0], new Set([1]))).toBeNull()
    expect(leastCost(g, RESISTANCE_SCENARIOS.base, [1], new Set([0]))).toBeNull()
  })
  it('ne fusionne pas deux noyaux séparés par un saut de ligne', () => {
    const g = graph([cell(3, 0), cell(4, 0), cell(5, 0), cell(0, 1), cell(1, 1), cell(2, 1)])
    expect(findCores(g).map((core) => core.length)).toEqual([3, 3])
  })
  it('ne compte pas une fausse lisière aux bords de lignes', () => {
    const g = graph([cell(5, 0), cell(0, 1, 'agricultural')])
    expect(contactIndex(g, 10)).toEqual({ lengthM: 0, indexMPerHa: 0 })
  })
  it('conserve les vraies connexions et longueurs de contact', () => {
    const g = graph([cell(1, 0), cell(2, 0, 'agricultural')])
    expect(leastCost(g, RESISTANCE_SCENARIOS.base, [0], new Set([1]))?.cells).toEqual([0, 1])
    expect(contactIndex(g, 10)).toEqual({ lengthM: 100, indexMPerHa: 10 })
  })
  it('refuse les dimensions invalides plutôt que calculer un tracé', () => {
    for (const width of [0, -1, NaN, 1.5]) expect(() => computeCorridors({ cells: [], width, height: 2, cellSizeM: 100, radiusM: 500 })).toThrow(RangeError)
  })
})
