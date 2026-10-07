import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

/**
 * Quality rules of the compass hook. Every sensor event here is SIMULATED
 * (synthetic events dispatched on `window`): this proves the hook's logic,
 * not the behaviour of a physical compass on Android or an iPhone.
 */
const getDeclination = vi.fn<(c: unknown, d: Date) => Promise<number | null>>()
vi.mock('@/services/geomagnetic', () => ({
  getDeclination: (c: unknown, d: Date) => getDeclination(c, d),
}))

import { useCompassHeading } from './useCompassHeading'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}

function setScreenAngle(angle: number | null) {
  if (angle === null) {
    Reflect.deleteProperty(window.screen, 'orientation')
    return
  }
  Object.defineProperty(window.screen, 'orientation', {
    configurable: true,
    value: {
      angle,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
}

function ios(heading: number, accuracy?: number) {
  const event = new Event('deviceorientation') as Event & {
    webkitCompassHeading?: number
    webkitCompassAccuracy?: number
  }
  event.webkitCompassHeading = heading
  if (accuracy !== undefined) event.webkitCompassAccuracy = accuracy
  act(() => {
    window.dispatchEvent(event)
  })
}

function absolute(
  alpha: number,
  beta = 0,
  gamma = 0,
  type = 'deviceorientationabsolute',
) {
  const event = new Event(type) as Event & {
    alpha?: number | null
    beta?: number
    gamma?: number
    absolute?: boolean
  }
  event.alpha = alpha
  event.beta = beta
  event.gamma = gamma
  event.absolute = true
  act(() => {
    window.dispatchEvent(event)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
  vi.stubGlobal('DeviceOrientationEvent', () => undefined)
  getDeclination.mockReset()
  getDeclination.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  setScreenAngle(null)
  Reflect.deleteProperty(document, 'hidden')
})

describe('iOS webkitCompassHeading path (simulated)', () => {
  it('accepts a heading with a good accuracy and exposes it', () => {
    const { result } = renderHook(() => useCompassHeading())
    ios(120, 10)
    expect(result.current.magneticHeading).toBe(120)
    expect(result.current.accuracyDegrees).toBe(10)
    expect(result.current.reliable).toBe(true)
    expect(result.current.warning).toBeNull()
  })

  it('flags an accuracy above 25 degrees as unreliable and asks to calibrate', () => {
    const { result } = renderHook(() => useCompassHeading())
    ios(120, 40)
    expect(result.current.reading.status).toBe('available')
    expect(result.current.reliable).toBe(false)
    expect(result.current.warning).toBe('Boussole peu fiable, calibrez-la.')
  })

  it('treats a negative or non-finite accuracy as an invalid heading', () => {
    const { result } = renderHook(() => useCompassHeading())
    ios(120, -1)
    expect(result.current.reading.status).toBe('unavailable')
    expect(result.current.magneticHeading).toBeNull()
    expect(result.current.reliable).toBe(false)
    ios(120, Number.NaN)
    expect(result.current.reading.status).toBe('unavailable')
  })

  it('stays unavailable when the permission is denied, available once granted', async () => {
    const Ctor = () => undefined
    Ctor.requestPermission = vi
      .fn<() => Promise<'granted' | 'denied'>>()
      .mockResolvedValueOnce('denied')
      .mockResolvedValueOnce('granted')
    vi.stubGlobal('DeviceOrientationEvent', Ctor)
    const { result } = renderHook(() => useCompassHeading())
    expect(result.current.needsPermission).toBe(true)

    await act(async () => {
      await result.current.requestPermission()
    })
    ios(50, 5)
    expect(result.current.reading).toEqual({
      status: 'unavailable',
      reason: 'Autorisation de la boussole refusée.',
    })

    await act(async () => {
      await result.current.requestPermission()
    })
    ios(50, 5)
    expect(result.current.magneticHeading).toBe(50)
    expect(result.current.needsPermission).toBe(false)
  })
})

describe('absolute orientation path (simulated)', () => {
  it('ignores relative-only orientation events: never a north-relative heading', () => {
    const { result } = renderHook(() => useCompassHeading())
    const relative = new Event('deviceorientation') as Event & {
      alpha?: number
      absolute?: boolean
    }
    relative.alpha = 90
    relative.absolute = false
    act(() => {
      window.dispatchEvent(relative)
    })
    expect(result.current.reading.status).toBe('unavailable')
    expect(result.current.magneticHeading).toBeNull()
    expect(result.current.trueHeading).toBeNull()
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(result.current.reading.status).toBe('unavailable')
    expect((result.current.reading as { reason?: string }).reason).toMatch(/cap absolu/)
  })

  it('accepts a deviceorientation event flagged absolute', () => {
    const { result } = renderHook(() => useCompassHeading())
    absolute(90, 0, 0, 'deviceorientation')
    expect(result.current.magneticHeading).toBeCloseTo(270, 6)
  })

  it('computes the heading from alpha/beta/gamma (phone upright)', () => {
    const { result } = renderHook(() => useCompassHeading())
    absolute(90, 90, 0)
    expect(result.current.magneticHeading).toBeCloseTo(270, 6)
    expect(result.current.reliable).toBe(true)
    expect(result.current.accuracyDegrees).toBeUndefined()
  })

  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
  ])('applies the screen angle %i (flat phone, alpha 0)', (angle, expected) => {
    setScreenAngle(angle)
    const { result } = renderHook(() => useCompassHeading())
    absolute(0, 0, 0)
    expect(result.current.magneticHeading).toBeCloseTo(expected, 6)
  })

  it('uses the legacy window.orientation when Screen Orientation is missing', () => {
    Object.defineProperty(window, 'orientation', { configurable: true, value: -90 })
    const { result } = renderHook(() => useCompassHeading())
    absolute(0, 0, 0)
    expect(result.current.magneticHeading).toBeCloseTo(270, 6)
    Reflect.deleteProperty(window, 'orientation')
  })

  it('re-computes when the screen rotates without a new sensor event', () => {
    setScreenAngle(0)
    const { result } = renderHook(() => useCompassHeading())
    absolute(0, 0, 0)
    expect(result.current.magneticHeading).toBeCloseTo(0, 6)
    setScreenAngle(90)
    act(() => {
      window.dispatchEvent(new Event('orientationchange'))
    })
    expect(result.current.magneticHeading).toBeCloseTo(90, 6)
  })
})

describe('true heading', () => {
  it('adds the declination to the magnetic heading', async () => {
    getDeclination.mockResolvedValue(-15)
    const { result } = renderHook(() =>
      useCompassHeading({ position: { lat: 46.81, lng: -71.2 } }),
    )
    await act(async () => {
      await Promise.resolve()
    })
    ios(10, 5)
    expect(result.current.declinationDegrees).toBe(-15)
    expect(result.current.magneticHeading).toBe(10)
    expect(result.current.trueHeading).toBe(355)
  })

  it('has no true heading without a position or when the declination is unknown', async () => {
    const { result, rerender } = renderHook(
      ({ withPosition }) =>
        useCompassHeading({ position: withPosition ? { lat: 46.8, lng: -71.2 } : null }),
      { initialProps: { withPosition: false } },
    )
    ios(10, 5)
    expect(result.current.trueHeading).toBeNull()
    expect(getDeclination).not.toHaveBeenCalled()

    rerender({ withPosition: true }) // model out of validity: null
    await act(async () => {
      await Promise.resolve()
    })
    expect(getDeclination).toHaveBeenCalledTimes(1)
    expect(result.current.declinationDegrees).toBeNull()
    expect(result.current.trueHeading).toBeNull()
    expect(result.current.magneticHeading).toBe(10)
  })

  it('looks the declination up once per 0.5 degree cell, not per GPS fix', async () => {
    getDeclination.mockResolvedValue(-14)
    const { rerender } = renderHook(
      ({ lat }) => useCompassHeading({ position: { lat, lng: -71.2 } }),
      { initialProps: { lat: 46.81 } },
    )
    rerender({ lat: 46.82 })
    rerender({ lat: 46.9 })
    await act(async () => {
      await Promise.resolve()
    })
    expect(getDeclination).toHaveBeenCalledTimes(1)
    rerender({ lat: 47.6 })
    expect(getDeclination).toHaveBeenCalledTimes(2)
  })
})

describe('staleness, throttling, lifecycle', () => {
  it('becomes unavailable "Cap perdu" after 3 s without an event, and recovers', () => {
    const { result } = renderHook(() => useCompassHeading())
    ios(120, 5)
    expect(result.current.magneticHeading).toBe(120)

    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(result.current.reading.status).toBe('unavailable')
    expect((result.current.reading as { reason?: string }).reason).toMatch(/Cap perdu/)
    expect(result.current.magneticHeading).toBeNull()
    expect(result.current.reliable).toBe(false)

    ios(121, 5)
    expect(result.current.magneticHeading).toBe(121)
  })

  it('keeps the heading while events keep arriving', () => {
    const { result } = renderHook(() => useCompassHeading())
    for (let i = 0; i < 10; i++) {
      ios(100 + i * 5, 5)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
    }
    expect(result.current.reading.status).toBe('available')
  })

  it('throttles to ~10 Hz and ignores changes under 1 degree', () => {
    const { result } = renderHook(() => useCompassHeading())
    ios(100, 5)
    act(() => {
      vi.advanceTimersByTime(20)
    })
    ios(150, 5) // too soon (20 ms): dropped
    expect(result.current.magneticHeading).toBe(100)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    ios(100.4, 5) // < 1 degree: noise
    expect(result.current.magneticHeading).toBe(100)

    ios(103, 5)
    expect(result.current.magneticHeading).toBe(103)
  })

  it('removes every listener and timer on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useCompassHeading())
    const added = add.mock.calls.map((c) => c[0]).sort()
    expect(added).toEqual(
      ['deviceorientation', 'deviceorientationabsolute', 'orientationchange'].sort(),
    )
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    unmount()
    const removed = remove.mock.calls.map((c) => c[0]).sort()
    expect(removed).toEqual(added)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('attaches nothing while disabled', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const { result } = renderHook(() => useCompassHeading({ enabled: false }))
    expect(add.mock.calls.filter((c) => c[0].startsWith('deviceorientation'))).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
    expect(result.current.reading.status).toBe('unavailable')
  })

  it('pauses while the page is hidden and resumes when it is visible again', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { result } = renderHook(() => useCompassHeading())
    ios(120, 5)
    expect(result.current.magneticHeading).toBe(120)

    act(() => setHidden(true))
    expect(result.current.reading.status).toBe('unavailable')
    expect(remove.mock.calls.map((c) => c[0])).toContain('deviceorientationabsolute')
    expect(vi.getTimerCount()).toBe(0)
    ios(200, 5) // ignored while hidden
    expect(result.current.magneticHeading).toBeNull()

    act(() => setHidden(false))
    ios(210, 5)
    expect(result.current.magneticHeading).toBe(210)
  })
})
