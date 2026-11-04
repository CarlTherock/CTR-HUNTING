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

import { SOFT_TILE_PROTOCOL, isSoftLayer, softTileTemplate } from './softTemplate'
import { ensureSoftTileProtocolRegistered, paddedGetMapUrl } from './softTiles'

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

  it('routes a GeoMet template through the soft-tile protocol, keeping the bbox token', () => {
    const template =
      'https://geo.weather.gc.ca/geomet?SERVICE=WMS&LAYERS=RADAR_1KM_RRAI&BBOX={bbox-epsg-3857}'
    expect(softTileTemplate(template)).toBe(
      'ctrsoft://geo.weather.gc.ca/geomet?SERVICE=WMS&LAYERS=RADAR_1KM_RRAI&BBOX={bbox-epsg-3857}',
    )
  })

  it('registers the protocol once', () => {
    expect(protocols.handlers[SOFT_TILE_PROTOCOL]).toBeTypeOf('function')
  })

  it('falls back to the original GeoMet bytes when the browser cannot smooth the tile', async () => {
    // jsdom has no createImageBitmap / canvas: the plain tile is returned.
    const fetchMock = vi.fn(async (_url: string) => pngResponse())
    vi.stubGlobal('fetch', fetchMock)
    const result = await protocols.handlers[SOFT_TILE_PROTOCOL](
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

  it('widens the GetMap request by 32 px per side so the blur sees real neighbours', () => {
    const url = 'https://geo.weather.gc.ca/geomet?WIDTH=256&HEIGHT=256&BBOX=0,0,2560,2560'
    const padded = new URL(paddedGetMapUrl(url) as string)
    expect(padded.searchParams.get('WIDTH')).toBe('320')
    expect(padded.searchParams.get('HEIGHT')).toBe('320')
    expect(padded.searchParams.get('BBOX')).toBe('-320,-320,2880,2880')
    expect(paddedGetMapUrl('https://geo.weather.gc.ca/geomet?BBOX=1,2,3,4')).toBeNull()
    expect(paddedGetMapUrl('not a url')).toBeNull()
  })

  it('rejects an HTTP error and an XML (non-image) answer instead of drawing them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pngResponse(503)),
    )
    await expect(
      protocols.handlers[SOFT_TILE_PROTOCOL](
        { url: 'ctrsoft://geo.weather.gc.ca/x' },
        new AbortController(),
      ),
    ).rejects.toThrow('503')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => pngResponse(200, 'text/xml')),
    )
    await expect(
      protocols.handlers[SOFT_TILE_PROTOCOL](
        { url: 'ctrsoft://geo.weather.gc.ca/x' },
        new AbortController(),
      ),
    ).rejects.toThrow('indisponible')
  })
})
