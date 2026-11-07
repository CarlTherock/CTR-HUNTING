import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtent } from '@/features/deer-intel/spatial/extent'
import {
  OverpassLandCoverProvider,
  buildQuery,
  classifyTags,
  parseOverpassLandCover,
} from './OverpassLandCoverProvider'

const ring = [
  { lat: 45.0, lon: -72.0 },
  { lat: 45.0, lon: -71.99 },
  { lat: 45.01, lon: -71.99 },
  { lat: 45.0, lon: -72.0 },
]

describe('OverpassLandCoverProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('classe les étiquettes OSM utiles et ignore les autres', () => {
    expect(classifyTags({ landuse: 'forest' })).toBe('forest')
    expect(classifyTags({ natural: 'water' })).toBe('water')
    expect(classifyTags({ landuse: 'farmland' })).toBe('agricultural')
    expect(classifyTags({ building: 'yes' })).toBe('developed')
    expect(classifyTags({ highway: 'residential' })).toBeNull()
    expect(classifyTags(undefined)).toBeNull()
  })

  it('transforme les chemins fermés et les anneaux extérieurs de relations', () => {
    const polys = parseOverpassLandCover({
      elements: [
        { type: 'way', id: 1, tags: { landuse: 'forest' }, geometry: ring },
        { type: 'way', id: 2, tags: { landuse: 'forest' }, geometry: ring.slice(0, 3) },
        {
          type: 'relation',
          id: 3,
          tags: { natural: 'water' },
          members: [
            { type: 'way', role: 'outer', geometry: ring },
            { type: 'way', role: 'inner', geometry: ring },
          ],
        },
        { type: 'way', id: 4, tags: { highway: 'path' }, geometry: ring },
      ],
    })
    expect(polys.map((p) => p.id)).toEqual(['w1', 'r3-0'])
    expect(polys[0].rings[0][0]).toEqual({ lat: 45, lng: -72 })
  })

  it('la requête couvre la boîte de l’étendue et demande la géométrie', () => {
    const q = buildQuery(createExtent({ lat: 45.5, lng: -72.5 }, 1000))
    expect(q).toContain('out geom')
    expect(q).toContain('45.49')
  })

  it('propage une erreur réseau sans fabriquer de données', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 504, json: () => null }),
    )
    await expect(
      new OverpassLandCoverProvider().fetchLandCover(
        createExtent({ lat: 45.5, lng: -72.5 }, 800),
      ),
    ).rejects.toThrow(/504/)
  })

  it('renvoie les polygones et la date de récupération', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            elements: [
              { type: 'way', id: 1, tags: { landuse: 'forest' }, geometry: ring },
            ],
          }),
      }),
    )
    const data = await new OverpassLandCoverProvider().fetchLandCover(
      createExtent({ lat: 45.5, lng: -72.5 }, 800),
    )
    expect(data.polygons).toHaveLength(1)
    expect(data.source).toContain('OpenStreetMap')
    expect(Number.isNaN(Date.parse(data.fetchedAt))).toBe(false)
  })
})
