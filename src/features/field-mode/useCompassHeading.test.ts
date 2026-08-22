import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCompassHeading } from './useCompassHeading'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCompassHeading', () => {
  it('starts unavailable with a real reason when DeviceOrientationEvent does not exist', () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)

    const { result } = renderHook(() => useCompassHeading())

    expect(result.current.reading.status).toBe('unavailable')
  })

  it('auto-starts (no permission needed) and reports a real heading from webkitCompassHeading', () => {
    vi.stubGlobal('DeviceOrientationEvent', () => undefined)

    const { result } = renderHook(() => useCompassHeading())
    expect(result.current.needsPermission).toBe(false)

    act(() => {
      const event = new Event('deviceorientation') as Event & { webkitCompassHeading?: number }
      event.webkitCompassHeading = 123
      window.dispatchEvent(event)
    })

    expect(result.current.reading).toEqual({
      status: 'available',
      value: 123,
      confidence: 'measured',
      source: 'device-orientation',
    })
  })

  it('converts a standard absolute alpha reading to a clockwise-from-north heading', () => {
    vi.stubGlobal('DeviceOrientationEvent', () => undefined)

    const { result } = renderHook(() => useCompassHeading())

    act(() => {
      const event = new Event('deviceorientationabsolute') as Event & {
        alpha?: number
        absolute?: boolean
      }
      event.alpha = 90
      event.absolute = true
      window.dispatchEvent(event)
    })

    expect(result.current.reading).toEqual({
      status: 'available',
      value: 270, // (360 - 90) % 360
      confidence: 'measured',
      source: 'device-orientation',
    })
  })

  it('requires an explicit requestPermission() when the constructor exposes one (iOS 13+), and reports denial honestly', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied')
    const FakeDeviceOrientationEvent = () => undefined
    FakeDeviceOrientationEvent.requestPermission = requestPermission
    vi.stubGlobal('DeviceOrientationEvent', FakeDeviceOrientationEvent)

    const { result } = renderHook(() => useCompassHeading())
    expect(result.current.needsPermission).toBe(true)

    await act(async () => {
      await result.current.requestPermission()
    })

    expect(requestPermission).toHaveBeenCalledOnce()
    expect(result.current.reading).toEqual({ status: 'unavailable', reason: 'Compass permission denied.' })
  })

  it('starts listening for real orientation events once permission is granted', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const FakeDeviceOrientationEvent = () => undefined
    FakeDeviceOrientationEvent.requestPermission = requestPermission
    vi.stubGlobal('DeviceOrientationEvent', FakeDeviceOrientationEvent)

    const { result } = renderHook(() => useCompassHeading())

    await act(async () => {
      await result.current.requestPermission()
    })

    act(() => {
      const event = new Event('deviceorientation') as Event & { webkitCompassHeading?: number }
      event.webkitCompassHeading = 45
      window.dispatchEvent(event)
    })

    expect(result.current.reading.status).toBe('available')
  })
})
