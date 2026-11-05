import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GeoMetProvider,
  buildFrames,
  extractTimeDimension,
  geoMetFrameLegendUrl,
  geoMetFrameTileUrls,
  geoMetTileUrls,
  buildExtrapolatedFrames,
  extractStyleNames,
  pickExtrapolationStyle,
  RADAR_EXTRAPOLATION,
  weatherTileMaxZoom,
  layerDef,
  parseIsoDurationMs,
  parseTimeDimension,
} from './GeoMetProvider'

describe('GeoMet time dimension parsing', () => {
  it('parses ISO durations GeoMet uses', () => {
    expect(parseIsoDurationMs('PT6M')).toBe(6 * 60_000)
    expect(parseIsoDurationMs('PT1H')).toBe(3600_000)
    expect(parseIsoDurationMs('bogus')).toBeNull()
  })

  it('expands start/end/period and comma lists', () => {
    expect(
      parseTimeDimension('2026-09-25T12:00:00Z/2026-09-25T13:00:00Z/PT30M'),
    ).toHaveLength(3)
    expect(parseTimeDimension('2026-09-25T12:00:00Z,2026-09-25T12:06:00Z')).toHaveLength(
      2,
    )
  })

  it('extracts the time dimension from a real-shaped capabilities doc', () => {
    const xml = `<Layer><Name>RADAR_1KM_RRAI</Name><Dimension name="time" units="ISO8601" default="2026-09-25T15:00:00Z">2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M</Dimension></Layer>`
    expect(extractTimeDimension(xml)).toBe(
      '2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M',
    )
  })
})

describe('buildFrames', () => {
  const now = new Date('2026-09-25T15:20:00Z')

  it('radar: no past at all, only the latest real frame ("now")', () => {
    const times = parseTimeDimension('2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M')
    const frames = buildFrames(layerDef('radar'), times, now)
    expect(frames).toEqual([{ time: '2026-09-25T15:00:00Z', kind: 'observed' }])
  })

  it('forecast: hourly from the current hour, never past hours, capped at +48 h', () => {
    const times = parseTimeDimension('2026-09-25T06:00:00Z/2026-09-28T06:00:00Z/PT1H')
    const frames = buildFrames(layerDef('temperature'), times, now)
    expect(frames[0]).toEqual({ time: '2026-09-25T15:00:00Z', kind: 'forecast' })
    expect(frames).toHaveLength(49)
  })
})

describe('legend and point value follow the real product', () => {
  it('a model frame uses the HRDPS legend, not the observed radar scale', () => {
    const model = {
      time: '2026-09-25T17:00:00Z',
      kind: 'forecast' as const,
      modelForecast: true,
      wmsLayers: ['HRDPS.CONTINENTAL.DIAG_PR_PT1H'],
      styles: ['Precip-Accum_0to40mm_Dis'],
    }
    const url = geoMetFrameLegendUrl(layerDef('radar'), model, 0)
    expect(url).toContain('LAYER=HRDPS.CONTINENTAL.DIAG_PR_PT1H')
    expect(url).toContain('STYLE=Precip-Accum_0to40mm_Dis')
    const observed = geoMetFrameLegendUrl(layerDef('radar'), undefined, 0)
    expect(observed).toContain('LAYER=RADAR_1KM_RRAI')
  })

  it('a point value that nobody answered is an error, not "no echo"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }))
    await expect(
      new GeoMetProvider().fetchValueAt(layerDef('radar'), '2026-09-25T15:00:00Z', {
        lat: 46.8,
        lng: -71.2,
      }),
    ).rejects.toThrow('indisponible')
  })
})

describe('radar extrapolation helpers', () => {
  it('reads style names and picks the observed colours, else the closest, else the default', () => {
    const xml =
      '<Style><Name>A</Name><Title>x</Title></Style><Style><Name>Radar-Rain_Dis-14colors_Fr</Name></Style>'
    expect(extractStyleNames(xml)).toEqual(['A', 'Radar-Rain_Dis-14colors_Fr'])
    expect(
      pickExtrapolationStyle(
        ['A', 'Radar-Rain_Dis-14colors_Fr'],
        'Radar-Rain_Dis-14colors_Fr',
      ),
    ).toBe('Radar-Rain_Dis-14colors_Fr')
    expect(pickExtrapolationStyle(['A', 'Foo_Dis-14colors_Fr'], 'Z')).toBe(
      'Foo_Dis-14colors_Fr',
    )
    expect(pickExtrapolationStyle(['A'], 'Z')).toBe('')
  })

  it('keeps only instants after the last observed one, within 4 h, 12 min apart', () => {
    const times = parseTimeDimension('2026-09-25T14:00:00Z/2026-09-25T21:00:00Z/PT6M')
    const frames = buildExtrapolatedFrames(
      times,
      new Date('2026-09-25T15:00:00Z'),
      ['L'],
      [''],
    )
    expect(frames[0].time).toBe('2026-09-25T15:12:00Z')
    expect(frames.at(-1)?.time).toBe('2026-09-25T19:00:00Z')
    expect(frames.every((f) => f.extrapolated && f.kind === 'forecast')).toBe(true)
  })
})

describe('geoMetTileUrl', () => {
  it('builds one real WMS GetMap URL per layer (GeoMet rejects multi-layer GetMap), with an unencoded bbox token', () => {
    const [rain, snow] = geoMetTileUrls(layerDef('radar'), '2026-09-25T15:00:00Z')
    expect(rain).toContain('LAYERS=RADAR_1KM_RRAI&')
    expect(snow).toContain('LAYERS=RADAR_1KM_RSNO&')
    expect(rain).toContain('TIME=2026-09-25T15%3A00%3A00Z')
    expect(rain.endsWith('&BBOX={bbox-epsg-3857}')).toBe(true)
  })
})

describe('GeoMetProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches frames from the layer capabilities', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve(
            '<Dimension name="time" default="x">2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M</Dimension>',
          ),
      }),
    )
    const frames = await new GeoMetProvider().fetchFrames(
      layerDef('radar'),
      new Date('2026-09-25T15:10:00Z'),
    )
    expect(frames).toHaveLength(1)
    expect(frames.some((f) => f.extrapolated)).toBe(false)
  })

  it('radar: appends ECCC extrapolation frames after the last observed one, with their own layers and styles', async () => {
    const caps = (layer: string) => {
      if (layer === 'RADAR_1KM_RRAI')
        return '<Dimension name="time">2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M</Dimension>'
      return `<Style><Name>Radar-Rain_Dis-14colors_Fr</Name></Style><Style><Name>Other</Name></Style><Dimension name="time">2026-09-25T15:00:00Z/2026-09-25T17:00:00Z/PT6M</Dimension>`
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => ({
        ok: true,
        text: () => Promise.resolve(caps(url.searchParams.get('LAYER') ?? '')),
      })),
    )
    const frames = await new GeoMetProvider().fetchFrames(
      layerDef('radar'),
      new Date('2026-09-25T15:10:00Z'),
    )
    const extrapolated = frames.filter((f) => f.extrapolated)
    expect(frames[0].kind).toBe('observed')
    expect(extrapolated.length).toBe(10)
    expect(extrapolated[0].time).toBe('2026-09-25T15:12:00Z')
    expect(extrapolated.at(-1)?.time).toBe('2026-09-25T17:00:00Z')
    expect(extrapolated.every((f) => f.kind === 'forecast')).toBe(true)
    expect(extrapolated[0].wmsLayers).toEqual([
      RADAR_EXTRAPOLATION.rain,
      RADAR_EXTRAPOLATION.snow,
    ])
    const [rain] = geoMetFrameTileUrls(layerDef('radar'), extrapolated[0])
    expect(rain).toContain(`LAYERS=${RADAR_EXTRAPOLATION.rain}&`)
    expect(rain).toContain('STYLES=Radar-Rain_Dis-14colors_Fr')
    expect(rain).toContain('TIME=2026-09-25T15%3A12%3A00Z')
  })

  it('radar: if the extrapolation cannot be read, the observed radar is still returned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        if ((url.searchParams.get('LAYER') ?? '').includes('Extrapolation'))
          return { ok: false, status: 404, text: () => Promise.resolve('') }
        return {
          ok: true,
          text: () =>
            Promise.resolve(
              '<Dimension name="time">2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M</Dimension>',
            ),
        }
      }),
    )
    const frames = await new GeoMetProvider().fetchFrames(layerDef('radar'))
    expect(frames).toHaveLength(1)
    expect(frames.some((f) => f.extrapolated)).toBe(false)
  })

  it('radar: after the ~1 h extrapolation, the HRDPS hourly forecast continues to +4 h, labelled as a model', async () => {
    const caps = (layer: string) => {
      if (layer === 'RADAR_1KM_RRAI')
        return '<Dimension name="time">2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M</Dimension>'
      if (layer.includes('Extrapolation'))
        return '<Dimension name="time">2026-09-25T15:00:00Z/2026-09-25T16:00:00Z/PT6M</Dimension>'
      return '<Dimension name="time">2026-09-25T06:00:00Z/2026-09-27T06:00:00Z/PT1H</Dimension>'
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => ({
        ok: true,
        text: () => Promise.resolve(caps(url.searchParams.get('LAYER') ?? '')),
      })),
    )
    const frames = await new GeoMetProvider().fetchFrames(
      layerDef('radar'),
      new Date('2026-09-25T15:10:00Z'),
    )
    const model = frames.filter((f) => f.modelForecast)
    expect(frames[0]).toEqual({ time: '2026-09-25T15:00:00Z', kind: 'observed' })
    expect(frames.filter((f) => f.extrapolated).at(-1)?.time).toBe('2026-09-25T16:00:00Z')
    expect(model.map((f) => f.time)).toEqual([
      '2026-09-25T17:00:00Z',
      '2026-09-25T18:00:00Z',
      '2026-09-25T19:00:00Z',
    ])
    expect(model[0].wmsLayers).toEqual(['HRDPS.CONTINENTAL.DIAG_PR_PT1H'])
    expect(model.every((f) => f.kind === 'forecast')).toBe(true)
  })

  it('returns the real point value, converting m/s to km/h for wind', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ features: [{ properties: { value: 5 } }] }),
      }),
    )
    const value = await new GeoMetProvider().fetchValueAt(layerDef('wind'), 't', {
      lat: 46,
      lng: -72,
    })
    expect(value).toBe('18 km/h')
  })

  it('returns null, never 0, when there is no radar echo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ features: [] }),
      }),
    )
    const value = await new GeoMetProvider().fetchValueAt(layerDef('radar'), 't', {
      lat: 46,
      lng: -72,
    })
    expect(value).toBeNull()
  })
})

describe('weatherTileMaxZoom', () => {
  it('stops requesting tiles near the native grid so the map enlarges them smoothly', () => {
    expect(weatherTileMaxZoom(layerDef('radar'))).toBe(8)
    for (const id of [
      'precipitation',
      'temperature',
      'wind',
      'gusts',
      'clouds',
      'pressure',
    ] as const)
      expect(weatherTileMaxZoom(layerDef(id))).toBe(7)
  })
})
