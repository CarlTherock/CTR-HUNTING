import { describe, expect, it } from 'vitest'
import { pointInPolygon } from '@/features/deer-intel/spatial/geo'
import { parseWithStats } from './OverpassLandCoverProvider'

const rectangle = (x: number, y: number, size: number) => [
  { lat: y, lon: x },
  { lat: y, lon: x + size },
  { lat: y + size, lon: x + size },
  { lat: y + size, lon: x },
  { lat: y, lon: x },
]
const outer = rectangle(-72, 45, 0.04)
const inner = rectangle(-71.99, 45.01, 0.01)
const relation = (members: unknown[]) => ({ elements: [{ type: 'relation', id: 7, tags: { landuse: 'forest' }, members }] })

describe('occupation du sol : trous des multipolygones', () => {
  it('ne transforme pas une clairière intérieure en forêt', () => {
    const { polygons } = parseWithStats(relation([
      { role: 'outer', geometry: outer },
      { role: 'inner', geometry: inner },
    ]))
    expect(polygons).toHaveLength(1)
    expect(polygons[0].rings).toHaveLength(2)
    expect(pointInPolygon({ lat: 45.015, lng: -71.985 }, polygons[0].rings)).toBe(false)
    expect(pointInPolygon({ lat: 45.005, lng: -71.995 }, polygons[0].rings)).toBe(true)
  })

  it('assemble un trou découpé en segments', () => {
    const { polygons } = parseWithStats(relation([
      { role: 'outer', geometry: outer },
      { role: 'inner', geometry: inner.slice(0, 3) },
      { role: 'inner', geometry: inner.slice(2) },
    ]))
    expect(polygons[0].rings).toHaveLength(2)
  })

  it('rattache le trou au bon extérieur parmi plusieurs', () => {
    const { polygons } = parseWithStats(relation([
      { role: 'outer', geometry: outer },
      { role: 'outer', geometry: rectangle(-71, 45, 0.04) },
      { role: 'inner', geometry: inner },
    ]))
    expect(polygons.map((p) => p.rings.length)).toEqual([2, 1])
  })

  it('écarte la relation si un trou est incomplet au lieu de le remplir', () => {
    const r = parseWithStats(relation([
      { role: 'outer', geometry: outer },
      { role: 'inner', geometry: inner.slice(0, 3) },
    ]))
    expect(r.polygons).toHaveLength(0)
    expect(r.unclosedRings).toBeGreaterThan(0)
  })

  it('signale un trou sans extérieur contenant', () => {
    const r = parseWithStats(relation([
      { role: 'outer', geometry: outer },
      { role: 'inner', geometry: rectangle(-70, 45, 0.01) },
    ]))
    expect(r.polygons).toHaveLength(0)
    expect(r.unclosedRings).toBeGreaterThan(0)
  })
})
