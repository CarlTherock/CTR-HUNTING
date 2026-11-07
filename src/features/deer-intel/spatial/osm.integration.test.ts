import { describe, expect, it } from 'vitest'
import { parseWithStats } from '@/services/landcover/OverpassLandCoverProvider'
import { analyzeSpatial, defaultSpatialParams } from './analyzeSpatial'
import { buildGrid } from './grid'
import { makeProjection, pointInRing } from './geo'

describe('OSM → grille → secteurs et candidats', () => {
  it('une clairière agricole intérieure ne redevient pas forêt dans la chaîne spatiale', () => {
    const center = { lat: 45.6, lng: -72.9 }
    const projection = makeProjection(center)
    const rectangle = (half: number) => [[-half, -half], [half, -half], [half, half], [-half, half], [-half, -half]]
      .map(([x, y]) => { const p = projection.toCoordinate(x, y); return { lat: p.lat, lon: p.lng } })
    const outer = rectangle(600)
    const inner = rectangle(150)
    const { polygons, unclosedRings } = parseWithStats({ elements: [
      { type: 'relation', id: 1, tags: { landuse: 'forest' }, members: [
        { type: 'way', role: 'outer', geometry: outer },
        { type: 'way', role: 'inner', geometry: inner },
      ] },
      { type: 'way', id: 2, tags: { landuse: 'farmland' }, geometry: inner },
    ] })
    expect(unclosedRings).toBe(0)
    const params = defaultSpatialParams(center, 500)
    const { cells } = buildGrid(params.extent, polygons)
    const hole = inner.map((p) => ({ lat: p.lat, lng: p.lon }))
    const inside = cells.filter((c) => pointInRing(c.center, hole))
    expect(inside.length).toBeGreaterThan(0)
    expect(inside.every((c) => c.landClass === 'agricultural')).toBe(true)
    const spatial = analyzeSpatial(params, { polygons, source: 'gabarit de test', fetchedAt: '2026-11-07T12:00:00Z' })
    expect(spatial.coverage).toBe(1)
    expect(spatial.sectors.length).toBeGreaterThan(0)
    expect(spatial.candidates.length).toBeGreaterThan(0)
    expect(spatial.candidates.every((c) => !pointInRing(c.coordinate, hole))).toBe(true)
  })
})
