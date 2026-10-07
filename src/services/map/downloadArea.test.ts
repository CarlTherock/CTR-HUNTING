import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { waitForIdle } from './downloadArea'

function fakeMap() {
  const listeners = new Set<() => void>()
  const map = {
    once: vi.fn((_event: string, handler: () => void) => {
      listeners.add(handler)
    }),
    off: vi.fn((_event: string, handler: () => void) => {
      listeners.delete(handler)
    }),
  }
  return { map: map as unknown as MapLibreMap, listeners, raw: map }
}

describe('waitForIdle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves when the map goes idle and cancels its timeout', async () => {
    vi.useFakeTimers()
    const { map, listeners } = fakeMap()
    const promise = waitForIdle(map, 5000)
    for (const handler of [...listeners]) handler()
    expect(await promise).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves on timeout AND removes its idle listener, so a long sweep does not pile up one stale listener per tile', async () => {
    vi.useFakeTimers()
    const { map, listeners } = fakeMap()
    const promise = waitForIdle(map, 5000)
    expect(listeners.size).toBe(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(await promise).toBe(false) // a timeout is never reported as idle

    expect(listeners.size).toBe(0)
  })
})
