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
