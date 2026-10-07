import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRecordingWakeLock } from './useRecordingWakeLock'

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'wakeLock')
})

function stubWakeLock(request: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
}

describe('useRecordingWakeLock', () => {
  it('is inactive when not recording and never asks for a lock', () => {
    const request = vi.fn()
    stubWakeLock(request)
    const { result } = renderHook(() => useRecordingWakeLock(false))
    expect(result.current).toBe('inactive')
    expect(request).not.toHaveBeenCalled()
  })

  it('holds a screen lock while recording and releases it afterwards', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() })
    stubWakeLock(request)

    const { result, rerender } = renderHook(
      ({ active }) => useRecordingWakeLock(active),
      {
        initialProps: { active: true },
      },
    )

    await waitFor(() => expect(result.current).toBe('held'))
    expect(request).toHaveBeenCalledWith('screen')

    rerender({ active: false })
    await waitFor(() => expect(release).toHaveBeenCalled())
    expect(result.current).toBe('inactive')
  })

  it('reports "unavailable" when the browser has no Wake Lock API, instead of pretending', () => {
    const { result } = renderHook(() => useRecordingWakeLock(true))
    expect(result.current).toBe('unavailable')
  })

  it('reports "unavailable" when the browser refuses the lock', async () => {
    stubWakeLock(() => Promise.reject(new DOMException('low battery', 'NotAllowedError')))
    const { result } = renderHook(() => useRecordingWakeLock(true))
    await waitFor(() => expect(result.current).toBe('unavailable'))
  })
})
