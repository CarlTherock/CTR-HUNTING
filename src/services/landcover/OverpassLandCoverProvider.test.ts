import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtent } from '@/features/deer-intel/spatial/extent'
import {
  LandCoverError,
  OverpassLandCoverProvider,
  buildQuery,
  stitchRings,
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
      new OverpassLandCoverProvider(undefined, [0, 0]).fetchLandCover(
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
    const data = await new OverpassLandCoverProvider(undefined, [0, 0]).fetchLandCover(
      createExtent({ lat: 45.5, lng: -72.5 }, 800),
    )
    expect(data.polygons).toHaveLength(1)
    expect(data.source).toContain('OpenStreetMap')
    expect(Number.isNaN(Date.parse(data.fetchedAt))).toBe(false)
  })

  const pt = (lat: number, lon: number) => ({ lat, lon })
  // Une forêt dont le contour est coupé en trois chemins ouverts (cas courant des relations OSM).
  const splitForest = {
    type: 'relation',
    id: 9,
    tags: { landuse: 'forest' },
    members: [
      {
        type: 'way',
        role: 'outer',
        geometry: [pt(45, -72), pt(45, -71.99), pt(45.01, -71.99)],
      },
      // Segment fourni à l'envers : l'assemblage doit le retourner.
      { type: 'way', role: 'outer', geometry: [pt(45.01, -72), pt(45.01, -71.99)] },
      { type: 'way', role: 'outer', geometry: [pt(45.01, -72), pt(45, -72)] },
    ],
  }

  it('assemble un contour multipolygone coupé en plusieurs chemins (au lieu de le perdre)', () => {
    const polys = parseOverpassLandCover({ elements: [splitForest] })
    expect(polys).toHaveLength(1)
    const r = polys[0].rings[0]
    expect(r[0]).toEqual(r[r.length - 1])
    expect(r.length).toBe(5)
  })

  it('un contour qui ne se ferme pas est compté, jamais complété', () => {
    const { rings, unclosed } = stitchRings([
      [
        { lat: 0, lng: 0 },
        { lat: 0, lng: 1 },
      ],
    ])
    expect(rings).toHaveLength(0)
    expect(unclosed).toBe(1)
  })

  it('réponse 200 avec remarque de délai dépassé : ce n’est pas « aucune occupation du sol »', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ elements: [], remark: 'runtime error: Query timed out' }),
      }),
    )
    const promise = new OverpassLandCoverProvider(
      ['https://a.example/api', 'https://b.example/api'],
      [],
    ).fetchLandCover(createExtent({ lat: 45.5, lng: -72.5 }, 800))
    await expect(promise).rejects.toBeInstanceOf(LandCoverError)
    await expect(promise).rejects.toThrow(/réponse incomplète/)
  })

  it('bascule sur le miroir quand le service principal échoue et le nomme dans la source', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ elements: [splitForest] }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const data = await new OverpassLandCoverProvider(
      ['https://a.example/api', 'https://b.example/api'],
      [],
    ).fetchLandCover(createExtent({ lat: 45.5, lng: -72.5 }, 800))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(data.polygons).toHaveLength(1)
    expect(data.source).toContain('b.example')
  })

  it('l’erreur finale nomme chaque service, le code HTTP ou la cause', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 429, json: () => null })
        .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    )
    await expect(
      new OverpassLandCoverProvider(
        ['https://a.example/api', 'https://b.example/api'],
        [],
      ).fetchLandCover(createExtent({ lat: 45.5, lng: -72.5 }, 800)),
    ).rejects.toThrow(
      /a\.example a répondu HTTP 429.*b\.example injoignable.*Failed to fetch/,
    )
  })

  it('réessaie après un 502 passager puis réussit (service public surchargé)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502, json: () => null })
      .mockResolvedValueOnce({ ok: false, status: 502, json: () => null })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ elements: [splitForest] }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const data = await new OverpassLandCoverProvider(
      ['https://a.example/api'],
      [0, 0],
    ).fetchLandCover(createExtent({ lat: 45.5, lng: -72.5 }, 800))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(data.polygons).toHaveLength(1)
  })

  it('trois 502 de suite : erreur avec le nombre d’essais, sans données inventées', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: () => null })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      new OverpassLandCoverProvider(['https://a.example/api'], [0, 0]).fetchLandCover(
        createExtent({ lat: 45.5, lng: -72.5 }, 800),
      ),
    ).rejects.toThrow(/HTTP 502.*essai 2.*essai 3/)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('une erreur non passagère (404) n’est pas réessayée', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: () => null })
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      new OverpassLandCoverProvider(['https://a.example/api'], [0, 0]).fetchLandCover(
        createExtent({ lat: 45.5, lng: -72.5 }, 800),
      ),
    ).rejects.toThrow(/HTTP 404/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
