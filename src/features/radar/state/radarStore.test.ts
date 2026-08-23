import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRadarStore } from './radarStore'
import type { RadarFrameSet } from '@/types'

const fetchFrames = vi.fn()
vi.mock('@/services/radar', () => ({
  radarProvider: { fetchFrames: (...args: unknown[]) => fetchFrames(...args) },
  radarTileUrlTemplate: (host: string, path: string) => `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`,
}))

const FRAMES: RadarFrameSet = {
  host: 'https://tilecache.rainviewer.com',
  past: [
    { time: 1700000000, path: '/v2/radar/1700000000' },
    { time: 1700000600, path: '/v2/radar/1700000600' },
  ],
  nowcast: [{ time: 1700001200, path: '/v2/radar/1700001200' }],
}

afterEach(() => {
  vi.clearAllMocks()
  useRadarStore.setState({
    status: 'idle',
    frames: null,
    errorReason: null,
    enabled: false,
    selectedFrameIndex: 0,
    opacity: 0.75,
  })
})

describe('radarStore', () => {
  it('toggle() enables the layer and fetches frames when none are loaded', async () => {
    fetchFrames.mockResolvedValue(FRAMES)

    useRadarStore.getState().toggle()

    expect(useRadarStore.getState().enabled).toBe(true)
    expect(fetchFrames).toHaveBeenCalled()

    await vi.waitFor(() => {
      expect(useRadarStore.getState().status).toBe('available')
    })
    // Selects the last *past* (real observed) frame by default, not a
    // nowcast one.
    expect(useRadarStore.getState().selectedFrameIndex).toBe(1)
  })

  it('toggle() again just disables, without re-fetching an already-loaded field', async () => {
    fetchFrames.mockResolvedValue(FRAMES)
    useRadarStore.getState().toggle()
    await vi.waitFor(() => expect(useRadarStore.getState().status).toBe('available'))

    useRadarStore.getState().toggle()

    expect(useRadarStore.getState().enabled).toBe(false)
    expect(useRadarStore.getState().frames).not.toBeNull()

    useRadarStore.getState().toggle()
    expect(fetchFrames).toHaveBeenCalledTimes(1)
  })

  it('sets an error reason instead of throwing when the fetch fails', async () => {
    fetchFrames.mockRejectedValue(new Error('Radar request failed (503)'))

    useRadarStore.getState().toggle()

    await vi.waitFor(() => {
      expect(useRadarStore.getState().status).toBe('error')
    })
    expect(useRadarStore.getState().errorReason).toBe('Radar request failed (503)')
  })

  it('selectedTileUrlTemplate() builds the real tile URL for the selected frame, null before frames load', () => {
    expect(useRadarStore.getState().selectedTileUrlTemplate()).toBeNull()

    useRadarStore.setState({ frames: FRAMES, selectedFrameIndex: 2 })

    expect(useRadarStore.getState().selectedTileUrlTemplate()).toBe(
      'https://tilecache.rainviewer.com/v2/radar/1700001200/256/{z}/{x}/{y}/2/1_1.png',
    )
  })

  it('setSelectedFrameIndex clamps to the real combined past+nowcast frame count', () => {
    useRadarStore.setState({ frames: FRAMES })

    useRadarStore.getState().setSelectedFrameIndex(99)
    expect(useRadarStore.getState().selectedFrameIndex).toBe(2)

    useRadarStore.getState().setSelectedFrameIndex(-5)
    expect(useRadarStore.getState().selectedFrameIndex).toBe(0)
  })

  it('setOpacity clamps to 0-1', () => {
    useRadarStore.getState().setOpacity(1.5)
    expect(useRadarStore.getState().opacity).toBe(1)

    useRadarStore.getState().setOpacity(-0.2)
    expect(useRadarStore.getState().opacity).toBe(0)
  })
})
