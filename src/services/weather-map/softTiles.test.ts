import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const protocols = vi.hoisted(() => ({
  handlers: {} as Record<
    string,
    (params: { url: string }, abort: AbortController) => Promise<{ data: ArrayBuffer }>
  >,
}))
vi.mock('maplibre-gl', () => ({
  addProtocol: (name: string, handler: (typeof protocols.handlers)[string]) => {
    protocols.handlers[name] = handler
  },
}))

import { SOFT_LEVELS, isSoftLayer, softTileTemplate } from './softTemplate'
import { ensureSoftTileProtocolRegistered } from './softTiles'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 1, 2, 3]).buffer

function pngResponse(status = 200, type = 'image/png') {
  return new Response(PNG_BYTES.slice(0), { status, headers: { 'content-type': type } })
}

describe('softTiles', () => {
  beforeEach(() => {
    ensureSoftTileProtocolRegistered()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('applies to the colour-area layers only', () => {
    expect(isSoftLayer({ id: 'radar' })).toBe(true)
    expect(isSoftLayer({ id: 'precipitation' })).toBe(true)
    expect(isSoftLayer({ id: 'pressure' })).toBe(false)
    expect(isSoftLayer({ id: 'wind' })).toBe(false)
  })

  it('routes a GeoMet template through the protocol of its level, keeping the bbox token', () => {
    const template =
      'https://geo.weather.gc.ca/geomet?SERVICE=WMS&LAYERS=RADAR_1KM_RRAI&BBOX={bbox-epsg-3857}'
    expect(softTileTemplate(template, 'doux')).toBe(
      'ctrsoft://geo.weather.gc.ca/geomet?SERVICE=WMS&LAYERS=RADAR_1KM_RRAI&BBOX={bbox-epsg-3857}',
    )
    expect(softTileTemplate(template, 'tres-doux')).toMatch(/^ctrsoftx:\/\/geo\./)
    // « Précis »: GeoMet's tile untouched.
    expect(softTileTemplate(template, 'precis')).toBe(template)
  })

  it('registers one protocol per soft level, with a stronger blur for « Très doux »', () => {
    expect(protocols.handlers[SOFT_LEVELS.doux.protocol]).toBeTypeOf('function')
    expect(protocols.handlers[SOFT_LEVELS['tres-doux'].protocol]).toBeTypeOf('function')
    expect(SOFT_LEVELS['tres-doux'].radius).toBeGreaterThan(SOFT_LEVELS.doux.radius)
  })

  it('falls back to the original GeoMet bytes when the browser cannot smooth the tile', async () => {
    // jsdom has no createImageBitmap / canvas: the plain tile is returned.
    const fetchMock = vi.fn(async (_url: string) => pngResponse())
    vi.stubGlobal('fetch', fetchMock)
    const result = await protocols.handlers[SOFT_LEVELS.doux.protocol](
      { url: 'ctrsoft://geo.weather.gc.ca/geomet?BBOX=1,2,3,4' },
      new AbortController(),
    )
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://geo.weather.gc.ca/geomet?BBOX=1,2,3,4',
    )
    expect(Array.from(new Uint8Array(result.data))).toEqual(
      Array.from(new Uint8Array(PNG_BYTES)),
    )
  })

  it('rejects an HTTP error and an XML (non-image) answer instead of drawing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pngResponse(503)),
    )
    await expect(
      protocols.handlers[SOFT_LEVELS.doux.protocol](
        { url: 'ctrsoft://geo.weather.gc.ca/x' },
        new AbortController(),
      ),
    ).rejects.toThrow('503')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pngResponse(200, 'text/xml')),
    )
    await expect(
      protocols.handlers[SOFT_LEVELS.doux.protocol](
        { url: 'ctrsoft://geo.weather.gc.ca/x' },
        new AbortController(),
      ),
    ).rejects.toThrow('indisponible')
  })
})
