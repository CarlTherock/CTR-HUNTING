import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGpsClock } from './useGpsClock'

describe('useGpsClock', () => {
  afterEach(() => vi.useRealTimers())

  it('ticks every 5 s and stops ticking after unmount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const { result, unmount } = renderHook(() => useGpsClock())
    expect(result.current).toBe(1_000_000)

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(1_005_000)

    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
