import { describe, expect, it } from 'vitest'
import { COVER_BASE, scoreHabitat } from './habitat'
import type { GridCell, LandClass } from './types'

function cell(ix: number, iy: number, landClass: LandClass | null): GridCell {
  return { ix, iy, center: { lat: 46, lng: -72 }, landClass, state: 'scored', score: null, foodDistanceM: null }
}

describe('habitat : limites de grille', () => {
  it('ne rapproche pas le bord gauche de la fin de la ligne précédente', () => {
    const forest = cell(0, 1, 'forest')
    scoreHabitat([forest, cell(9, 0, 'agricultural')], 10, 100)
    expect(forest.score).toBe(COVER_BASE)
    expect(forest.foodDistanceM).toBeNull()
  })

  it('ne rapproche pas le bord droit du début de la ligne suivante', () => {
    const forest = cell(9, 0, 'forest')
    scoreHabitat([forest, cell(0, 1, 'open')], 10, 100)
    expect(forest.score).toBe(COVER_BASE)
    expect(forest.foodDistanceM).toBeNull()
  })

  it('conserve la distance et le score d’un vrai voisin', () => {
    const forest = cell(0, 1, 'forest')
    scoreHabitat([forest, cell(1, 1, 'agricultural')], 10, 100)
    expect(forest.foodDistanceM).toBe(100)
    expect(forest.score).toBe(84)
  })

  it('ne crée pas de fausse lisière par bouclage de ligne', () => {
    const field = cell(0, 1, 'agricultural')
    scoreHabitat([field, cell(9, 0, 'forest')], 10, 100)
    expect(field.score).toBe(15)
  })

  it('efface les résultats périmés des cellules inconnues et exclues', () => {
    const unknown = { ...cell(0, 0, null), score: 99, foodDistanceM: 10 }
    const water = { ...cell(1, 0, 'water'), score: 99, foodDistanceM: 10 }
    scoreHabitat([unknown, water], 10, 100)
    expect(unknown.state).toBe('unknown')
    expect(water.state).toBe('excluded')
    for (const c of [unknown, water]) {
      expect(c.score).toBeNull()
      expect(c.foodDistanceM).toBeNull()
    }
  })

  it('refuse les dimensions non valides', () => {
    expect(() => scoreHabitat([], 0, 100)).toThrow(RangeError)
    expect(() => scoreHabitat([], 10, 0)).toThrow(RangeError)
    expect(() => scoreHabitat([], 10, Number.NaN)).toThrow(RangeError)
  })
})
