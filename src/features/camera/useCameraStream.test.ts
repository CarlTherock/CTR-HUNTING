import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCameraStream } from './useCameraStream'

function makeFakeTrack(overrides: Partial<MediaStreamTrack> = {}): MediaStreamTrack {
  return {
    stop: vi.fn(),
    getCapabilities: vi.fn().mockReturnValue({}),
    getSettings: vi.fn().mockReturnValue({}),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MediaStreamTrack
}

function stubGetUserMedia(track: MediaStreamTrack) {
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  })
  return stream
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCameraStream', () => {
  it('starts idle and reports a real unsupported reason with no mediaDevices API', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined })
    const { result } = renderHook(() => useCameraStream())

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.errorReason).toMatch(/not supported/)
  })

  it('reaches streaming status on a real successful getUserMedia call', async () => {
    stubGetUserMedia(makeFakeTrack())
    const { result } = renderHook(() => useCameraStream())

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.status).toBe('streaming')
    expect(result.current.zoomRange).toBeNull() // this fake track reports no zoom capability
  })

  it('reports a real error reason when getUserMedia rejects (e.g. permission denied)', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')) },
    })
    const { result } = renderHook(() => useCameraStream())

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.status).toBe('error')
    expect(result.current.errorReason).toBe('Permission denied')
  })

  it('picks up a real hardware zoom range when the track reports one', async () => {
    const track = makeFakeTrack({
      getCapabilities: vi.fn().mockReturnValue({ zoom: { min: 1, max: 4, step: 0.1 } }),
      getSettings: vi.fn().mockReturnValue({ zoom: 1 }),
    })
    stubGetUserMedia(track)
    const { result } = renderHook(() => useCameraStream())

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.zoomRange).toEqual({ min: 1, max: 4, step: 0.1 })
    expect(result.current.zoom).toBe(1)
  })

  it('setZoom applies a real constraint to the track', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined)
    const track = makeFakeTrack({
      getCapabilities: vi.fn().mockReturnValue({ zoom: { min: 1, max: 4, step: 0.1 } }),
      applyConstraints,
    })
    stubGetUserMedia(track)
    const { result } = renderHook(() => useCameraStream())
    await act(async () => {
      await result.current.start()
    })

    await act(async () => {
      await result.current.setZoom(2.5)
    })

    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 2.5 }] })
    await waitFor(() => expect(result.current.zoom).toBe(2.5))
  })

  it('stop() releases the real track and resets to idle', async () => {
    const stop = vi.fn()
    stubGetUserMedia(makeFakeTrack({ stop }))
    const { result } = renderHook(() => useCameraStream())
    await act(async () => {
      await result.current.start()
    })

    act(() => {
      result.current.stop()
    })

    expect(stop).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('idle')
  })
})
