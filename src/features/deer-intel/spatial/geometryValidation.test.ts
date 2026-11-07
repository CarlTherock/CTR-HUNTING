import { describe, expect, it } from 'vitest'
import type { Coordinate } from '@/types'
import { parseWithStats } from '@/services/landcover/OverpassLandCoverProvider'
import { ringStrictlyContainsRing } from './ringContainment'
import { pointInRing } from './geo'
import { pickCandidates } from './candidates'
import { defaultSpatialParams } from './analyzeSpatial'
import type { GridCell, Sector } from './types'

const ring = (points: number[][]): Coordinate[] => points.map(([x, y]) => ({ lat: 45 + y / 1000, lng: -72 + x / 1000 }))
const rect = (x0: number, y0: number, x1: number, y1: number) => ring([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]])
const outer = rect(0, 0, 10, 10)
const inner = rect(2, 2, 4, 4)
const concave = ring([[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10], [0, 0]])
const overpass = (outside: Coordinate[], hole: Coordinate[]) => ({ elements: [{
  type: 'relation', id: 7, tags: { landuse: 'forest' },
  members: [{ type: 'way', role: 'outer', geometry: outside.map((p) => ({ lat: p.lat, lon: p.lng })) },
    { type: 'way', role: 'inner', geometry: hole.map((p) => ({ lat: p.lat, lon: p.lng })) }],
}] })

describe('inclusion complète des trous', () => {
  it('conserve un trou intérieur valide dans les deux orientations', () => {
    expect(ringStrictlyContainsRing(outer, inner)).toBe(true)
    expect(ringStrictlyContainsRing([...outer].reverse(), [...inner].reverse())).toBe(true)
  })
  it('refuse un débordement même si le premier point est intérieur', () => {
    const hole = rect(2, 2, 12, 4)
    expect(pointInRing(hole[0], outer)).toBe(true)
    expect(ringStrictlyContainsRing(outer, hole)).toBe(false)
  })
  it('refuse une arête traversante même si tous les sommets sont intérieurs', () => {
    const hole = rect(1, 7, 9, 9)
    expect(hole.every((p) => pointInRing(p, concave))).toBe(true)
    expect(ringStrictlyContainsRing(concave, hole)).toBe(false)
  })
  it('écarte les contacts avec une arête ou un sommet, sans les réparer', () => {
    expect(ringStrictlyContainsRing(outer, rect(0, 2, 2, 4))).toBe(false)
    expect(ringStrictlyContainsRing(outer, ring([[0, 0], [3, 1], [1, 3], [0, 0]]))).toBe(false)
  })
  it('refuse les anneaux ouverts, dégénérés ou non finis', () => {
    expect(ringStrictlyContainsRing(outer, inner.slice(0, -1))).toBe(false)
    expect(ringStrictlyContainsRing(outer, ring([[2, 2], [3, 3], [4, 4], [2, 2]]))).toBe(false)
    expect(ringStrictlyContainsRing(outer, inner.map((p, i) => i === 1 ? { ...p, lat: NaN } : p))).toBe(false)
  })
  it('le parseur écarte une relation dont un trou déborde, avec diagnostic', () => {
    const result = parseWithStats(overpass(outer, rect(2, 2, 12, 4)))
    expect(result.polygons).toEqual([])
    expect(result.unclosedRings).toBeGreaterThan(0)
  })
  it('le parseur conserve le trou valide et écarte les traversées concaves', () => {
    expect(parseWithStats(overpass(outer, inner)).polygons[0].rings).toHaveLength(2)
    expect(parseWithStats(overpass(concave, rect(1, 7, 9, 9))).polygons).toEqual([])
  })
})

describe('attribution des candidats aux secteurs à trous', () => {
  const center = { lat: 45.003, lng: -71.997 }
  const cell: GridCell = { ix: 0, iy: 0, center, landClass: 'forest', state: 'scored', score: 80, foodDistanceM: 100 }
  const sector = (id: string, rings: Coordinate[][]): Sector => ({ id, rings, rank: 1, cellCount: 4, areaHa: 1, meanScore: 80, centroid: center })
  it('ne rattache pas un candidat au secteur dont il occupe le trou', () => {
    const result = pickCandidates(defaultSpatialParams(center, 500), [cell], [sector('S1', [outer, inner])])
    expect(result).toHaveLength(1)
    expect(result[0].sectorId).toBeNull()
  })
  it('rattache correctement une île à son propre secteur', () => {
    const result = pickCandidates(defaultSpatialParams(center, 500), [cell], [
      sector('S1', [outer, inner]), sector('S2', [rect(2.5, 2.5, 3.5, 3.5)]),
    ])
    expect(result[0].sectorId).toBe('S2')
    expect(result[0].score).toBe(80)
  })
})
