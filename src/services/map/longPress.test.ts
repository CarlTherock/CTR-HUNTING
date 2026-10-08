import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLongPressDetector } from './longPress'

describe('long press detector', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function make() {
    const onLongPress = vi.fn()
    return { onLongPress, detector: createLongPressDetector({ onLongPress }) }
  }

  it('fires once after the delay for a single still finger', () => {
    const { onLongPress, detector } = make()
    detector.start({ x: 10, y: 20 }, 1)
    vi.advanceTimersByTime(549)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onLongPress).toHaveBeenCalledWith({ x: 10, y: 20 })
    expect(detector.justFired(Date.now())).toBe(true)
  })

  it('does not fire when the finger lifts early, drags, or a second finger lands', () => {
    const { onLongPress, detector } = make()
    detector.start({ x: 0, y: 0 }, 1)
    detector.cancel()
    vi.advanceTimersByTime(1000)

    detector.start({ x: 0, y: 0 }, 1)
    detector.move({ x: 30, y: 0 })
    vi.advanceTimersByTime(1000)

    detector.start({ x: 0, y: 0 }, 2)
    vi.advanceTimersByTime(1000)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(detector.justFired(Date.now())).toBe(false)
  })

  it('tolerates a small tremor', () => {
    const { onLongPress, detector } = make()
    detector.start({ x: 0, y: 0 }, 1)
    detector.move({ x: 4, y: 3 })
    vi.advanceTimersByTime(600)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })
})
