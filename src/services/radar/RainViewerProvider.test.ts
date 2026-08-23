import { afterEach, describe, expect, it, vi } from 'vitest'
import { RainViewerProvider } from './RainViewerProvider'
import { radarTileUrlTemplate } from './RainViewerProvider'

const FAKE_RESPONSE = {
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1700000000, path: '/v2/radar/1700000000' },
      { time: 1700000600, path: '/v2/radar/1700000600' },
    ],
    nowcast: [{ time: 1700001200, path: '/v2/radar/1700001200' }],
  },
}

function stubFetch(response: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(response),
    }),
  )
}

describe('RainViewerProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests RainViewer\'s real public maps endpoint and returns real past/nowcast frames', async () => {
    stubFetch(FAKE_RESPONSE)
    const provider = new RainViewerProvider()

    const result = await provider.fetchFrames()

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledWith('https://api.rainviewer.com/public/weather-maps.json')
    expect(result).toEqual({
      host: 'https://tilecache.rainviewer.com',
      past: FAKE_RESPONSE.radar.past,
      nowcast: FAKE_RESPONSE.radar.nowcast,
    })
  })

  it('throws on a non-ok response rather than returning empty frames', async () => {
    stubFetch({}, false, 503)
    const provider = new RainViewerProvider()

    await expect(provider.fetchFrames()).rejects.toThrow('503')
  })
})

describe('radarTileUrlTemplate', () => {
  it('builds the real RainViewer XYZ template from a frame\'s host/path', () => {
    expect(radarTileUrlTemplate('https://tilecache.rainviewer.com', '/v2/radar/1700000000')).toBe(
      'https://tilecache.rainviewer.com/v2/radar/1700000000/256/{z}/{x}/{y}/2/1_1.png',
    )
  })
})
