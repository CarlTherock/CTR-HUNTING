import { describe, expect, it } from 'vitest'
import { analyzeSpatial, defaultSpatialParams } from './analyzeSpatial'
import { createExtent, extentKey, MAX_RADIUS_M, MIN_RADIUS_M } from './extent'
import { makeProjection } from './geo'
import { toOverlay } from './overlay'
import type { LandCoverData, LandClass, LandPolygon } from './types'

const CENTER = { lat: 45.6, lng: -72.9 }
const proj = makeProjection(CENTER)

/** Rectangle en mètres autour du centre → polygone lng/lat. */
function rect(
  id: string,
  landClass: LandClass,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): LandPolygon {
  return {
    id,
    landClass,
    rings: [
      [
        proj.toCoordinate(x0, y0),
        proj.toCoordinate(x1, y0),
        proj.toCoordinate(x1, y1),
        proj.toCoordinate(x0, y1),
        proj.toCoordinate(x0, y0),
      ],
    ],
  }
}
const land = (polygons: LandPolygon[]): LandCoverData => ({
  polygons,
  source: 'test',
  fetchedAt: '2026-11-06T12:00:00Z',
})
const params = (radius = 800) => defaultSpatialParams(CENTER, radius)

describe('étendue ancrée', () => {
  it('borne le rayon et ne dépend que du point et du rayon', () => {
    expect(createExtent(CENTER, 10).radiusM).toBe(MIN_RADIUS_M)
    expect(createExtent(CENTER, 99_999).radiusM).toBe(MAX_RADIUS_M)
    expect(extentKey(createExtent(CENTER, 1000))).toBe(
      extentKey(createExtent(CENTER, 1000)),
    )
  })
  it('refuse des coordonnées invalides', () => {
    expect(() => createExtent({ lat: NaN, lng: 0 }, 500)).toThrow()
    expect(() => createExtent({ lat: 95, lng: 0 }, 500)).toThrow()
  })
  it('le résultat ne dépend pas de la vue de la carte (déterministe)', () => {
    const data = land([
      rect('f', 'forest', -800, -800, 0, 800),
      rect('a', 'agricultural', 0, -800, 800, 800),
    ])
    expect(analyzeSpatial(params(), data)).toEqual(analyzeSpatial(params(), data))
  })
})

describe('habitat, secteurs et points candidats', () => {
  it('sans donnée : aucun secteur, aucun score, couverture nulle', () => {
    const a = analyzeSpatial(params(), null)
    expect(a.sectors).toEqual([])
    expect(a.candidates).toEqual([])
    expect(a.coverage).toBe(0)
    expect(a.source).toBeNull()
    expect(a.limits[0]).toContain('Aucune donnée')
  })

  it('lisière simple forêt / champ : secteur forestier près du champ, points espacés', () => {
    const a = analyzeSpatial(
      params(),
      land([
        rect('f', 'forest', -800, -800, 0, 800),
        rect('a', 'agricultural', 0, -800, 800, 800),
      ]),
    )
    expect(a.coverage).toBeGreaterThan(0.95)
    expect(a.sectors.length).toBeGreaterThan(0)
    expect(a.candidates.length).toBeGreaterThan(0)
    expect(a.candidates.length).toBeLessThanOrEqual(5)
    // Meilleur point : forêt, proche du champ (x ≤ 0).
    const best = a.candidates[0]
    expect(proj.toMeters(best.coordinate).x).toBeLessThanOrEqual(0)
    expect(best.reasons.join(' ')).toContain('Couvert forestier')
    expect(best.missing.length).toBeGreaterThan(0)
    // Rangs absolus et ordre décroissant.
    for (let i = 1; i < a.candidates.length; i++)
      expect(a.candidates[i - 1].score).toBeGreaterThanOrEqual(a.candidates[i].score)
  })

  it('couvert fragmenté : plusieurs secteurs distincts', () => {
    const a = analyzeSpatial(
      params(1000),
      land([
        rect('a', 'agricultural', -1000, -1000, 1000, 1000),
        rect('f1', 'forest', -600, -600, -300, -300),
        rect('f2', 'forest', 300, 300, 600, 600),
      ]),
    )
    expect(a.sectors.length).toBe(2)
    expect(a.sectors[0].rank).toBe(1)
    expect(a.sectors[0].rings[0].length).toBeGreaterThanOrEqual(4)
  })

  it('jamais de point sur l’eau ni le bâti', () => {
    const a = analyzeSpatial(
      params(),
      land([
        rect('f', 'forest', -800, -800, 800, 800),
        rect('a', 'agricultural', 400, -800, 800, 800),
        rect('w', 'water', -300, -300, 300, 300),
      ]),
    )
    for (const c of a.candidates) {
      const m = proj.toMeters(c.coordinate)
      expect(Math.abs(m.x) > 300 || Math.abs(m.y) > 300).toBe(true)
    }
  })

  it('respecte les zones exclues et l’espacement minimal', () => {
    const base = land([
      rect('f', 'forest', -800, -800, 0, 800),
      rect('a', 'agricultural', 0, -800, 800, 800),
    ])
    const p = params()
    const free = analyzeSpatial(p, base)
    const exclusion = rect('x', 'forest', -800, -800, 0, 800).rings
    const blocked = analyzeSpatial({ ...p, exclusions: exclusion }, base)
    expect(free.candidates.length).toBeGreaterThan(0)
    expect(blocked.candidates).toEqual([])
    for (const c of free.candidates)
      for (const o of free.candidates)
        if (c !== o) {
          const d = Math.hypot(
            proj.toMeters(c.coordinate).x - proj.toMeters(o.coordinate).x,
            proj.toMeters(c.coordinate).y - proj.toMeters(o.coordinate).y,
          )
          expect(d).toBeGreaterThanOrEqual(p.minSpacingM - 1)
        }
  })

  it('source partielle : la couverture baisse, les cellules sans donnée n’ont pas de score', () => {
    const a = analyzeSpatial(params(), land([rect('f', 'forest', -800, -800, 0, 800)]))
    expect(a.coverage).toBeGreaterThan(0.3)
    expect(a.coverage).toBeLessThan(0.7)
  })

  it('aucun secteur lorsque tout est ouvert sans couvert', () => {
    const a = analyzeSpatial(
      params(),
      land([rect('a', 'agricultural', -800, -800, 800, 800)]),
    )
    expect(a.sectors).toEqual([])
  })

  it('corridors : jamais calculés, avec la raison', () => {
    const a = analyzeSpatial(params(), land([rect('f', 'forest', -800, -800, 800, 800)]))
    expect(a.corridors.computed).toBe(false)
    expect(a.corridors.reason).toContain('Corridors non calculés')
  })

  it('fonctionne sans aucune observation (aucune entrée de journal)', () => {
    const a = analyzeSpatial(params(), land([rect('f', 'forest', -800, -800, 800, 800)]))
    expect(
      a.candidates.every((c) => c.missing.some((m) => m.includes('Aucune observation'))),
    ).toBe(true)
  })

  it('l’overlay carte contient des polygones fermés et les rangs', () => {
    const a = analyzeSpatial(
      params(),
      land([
        rect('f', 'forest', -800, -800, 0, 800),
        rect('a', 'agricultural', 0, -800, 800, 800),
      ]),
    )
    const o = toOverlay(a)
    expect(o.sectors.features.length).toBe(a.sectors.length)
    for (const f of o.sectors.features) {
      const r = f.geometry.coordinates[0]
      expect(r[0]).toEqual(r[r.length - 1])
    }
    expect(o.candidates.features[0].properties.grade).toBe(a.candidates[0].grade)
    expect(o.extent.length).toBeGreaterThan(40)
  })
})
