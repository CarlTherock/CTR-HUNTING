import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GeoMetProvider,
  buildFrames,
  extractTimeDimension,
  geoMetTileUrls,
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

  it('radar: observed frames every 12 min ending on the latest real frame, skipping the about-to-expire oldest ones', () => {
    const times = parseTimeDimension('2026-09-25T12:00:00Z/2026-09-25T15:00:00Z/PT6M')
    const frames = buildFrames(layerDef('radar'), times, now)
    expect(frames).toHaveLength(14)
    expect(frames.at(-1)).toEqual({ time: '2026-09-25T15:00:00Z', kind: 'observed' })
    expect(frames[0].time).toBe('2026-09-25T12:24:00Z')
  })

  it('forecast: hourly from the current hour, never past hours, capped at +48 h', () => {
    const times = parseTimeDimension('2026-09-25T06:00:00Z/2026-09-28T06:00:00Z/PT1H')
    const frames = buildFrames(layerDef('temperature'), times, now)
    expect(frames[0]).toEqual({ time: '2026-09-25T15:00:00Z', kind: 'forecast' })
    expect(frames).toHaveLength(49)
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
    expect(frames).toHaveLength(14)
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
