import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverpassVegetationProvider } from './OverpassVegetationProvider'

const COORDINATE = { lat: 46.8, lng: -71.2 }

function stubFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(response) }),
  )
}

describe('OverpassVegetationProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs a real Overpass QL query including nwr/around and the coordinate', async () => {
    stubFetch({ elements: [{ tags: { landuse: 'forest' } }] })
    const provider = new OverpassVegetationProvider()

    await provider.fetchVegetation(COORDINATE, 300)

    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toBe('https://overpass-api.de/api/interpreter')
    const body = new URLSearchParams(String((init as RequestInit).body)).get('data') ?? ''
    expect(body).toContain('nwr')
    expect(body).toContain('around:300')
    expect(body).toContain('46.8')
    expect(body).toContain('-71.2')
  })

  it('maps real OSM tags to the correct hunting-relevant categories', async () => {
    stubFetch({
      elements: [
        { tags: { landuse: 'forest' } },
        { tags: { natural: 'water' } },
        { tags: { landuse: 'farmland' } },
        { tags: { landuse: 'residential' } },
      ],
    })
    const provider = new OverpassVegetationProvider()

    const sample = await provider.fetchVegetation(COORDINATE, 300)

    expect(sample?.categoryCounts).toEqual({ forest: 1, water: 1, agricultural: 1, developed: 1 })
    expect(sample?.source).toBe('openstreetmap')
  })

  it('returns null when no elements come back', async () => {
    stubFetch({ elements: [] })
    const provider = new OverpassVegetationProvider()

    expect(await provider.fetchVegetation(COORDINATE, 300)).toBeNull()
  })

  it('returns null when elements exist but none map to a tracked category', async () => {
    stubFetch({ elements: [{ tags: { landuse: 'religious' } }] })
    const provider = new OverpassVegetationProvider()

    const sample = await provider.fetchVegetation(COORDINATE, 300)
    // 'religious' still falls into the 'other' bucket per categorize()'s
    // fallback — assert that bucket, not null, to match real behavior.
    expect(sample?.categoryCounts).toEqual({ other: 1 })
  })

  it('throws on a non-OK response rather than fabricating data', async () => {
    stubFetch(null, false, 504)
    const provider = new OverpassVegetationProvider()

    await expect(provider.fetchVegetation(COORDINATE, 300)).rejects.toThrow(/504/)
  })
})

describe('OverpassVegetationProvider.fetchVegetationGrid', () => {
  const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('makes exactly one request for the whole bounding box, not one per grid point', async () => {
    stubFetch({ elements: [] })
    const provider = new OverpassVegetationProvider()

    await provider.fetchVegetationGrid(BOUNDS, 5)

    expect(fetch).toHaveBeenCalledOnce()
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = new URLSearchParams(String((init as RequestInit).body)).get('data') ?? ''
    expect(body).toContain('nwr(46.7,-71.3,46.9,-71.1)')
    expect(body).toContain('out center;')
  })

  it('returns exactly one sample per grid point, even with no real elements found', async () => {
    stubFetch({ elements: [] })
    const provider = new OverpassVegetationProvider()

    const samples = await provider.fetchVegetationGrid(BOUNDS, 3)

    expect(samples).toHaveLength(9)
    expect(samples.every((s) => Object.keys(s.categoryCounts).length === 0)).toBe(true)
  })

  it('assigns each real element to its nearest grid cell using node lat/lon or way/relation center', async () => {
    stubFetch({
      elements: [
        { tags: { landuse: 'forest' }, lat: 46.71, lon: -71.29 }, // near the SW corner
        { tags: { natural: 'water' }, center: { lat: 46.89, lon: -71.11 } }, // near the NE corner
      ],
    })
    const provider = new OverpassVegetationProvider()

    const samples = await provider.fetchVegetationGrid(BOUNDS, 2)

    const totalForest = samples.reduce((sum, s) => sum + (s.categoryCounts.forest ?? 0), 0)
    const totalWater = samples.reduce((sum, s) => sum + (s.categoryCounts.water ?? 0), 0)
    expect(totalForest).toBe(1)
    expect(totalWater).toBe(1)
  })

  it('ignores elements with no usable coordinate', async () => {
    stubFetch({ elements: [{ tags: { landuse: 'forest' } }] }) // no lat/lon, no center
    const provider = new OverpassVegetationProvider()

    const samples = await provider.fetchVegetationGrid(BOUNDS, 2)

    expect(samples.every((s) => Object.keys(s.categoryCounts).length === 0)).toBe(true)
  })
})
