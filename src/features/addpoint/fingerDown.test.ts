import { describe, expect, it, vi } from 'vitest'
import { fingerIsDown, onFingerRelease } from './fingerDown'

function touch(type: string, count: number) {
  const event = new Event(type, { bubbles: true }) as Event & { touches: unknown[] }
  event.touches = Array.from({ length: count })
  document.dispatchEvent(event)
}

describe('fingerDown', () => {
  it('knows whether a finger is on the screen', () => {
    expect(fingerIsDown()).toBe(false)
    touch('touchstart', 1)
    expect(fingerIsDown()).toBe(true)
    touch('touchend', 0)
    expect(fingerIsDown()).toBe(false)
  })

  it('calls back once, only when the LAST finger lifts', () => {
    const onRelease = vi.fn()
    onFingerRelease(onRelease)
    touch('touchstart', 2)
    touch('touchend', 1)
    expect(onRelease).not.toHaveBeenCalled()
    touch('touchend', 0)
    touch('touchend', 0)
    expect(onRelease).toHaveBeenCalledTimes(1)
  })

  it('stops watching when cleaned up', () => {
    const onRelease = vi.fn()
    const stop = onFingerRelease(onRelease)
    stop()
    touch('touchend', 0)
    expect(onRelease).not.toHaveBeenCalled()
  })
})
