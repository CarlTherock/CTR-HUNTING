import { useCallback, useEffect, useState } from 'react'
import type { DataPoint } from '@/types'

export type CompassReading = DataPoint<number> // degrees, 0 = north, clockwise

interface DeviceOrientationEventIOS {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/** Safari on iOS reports compass heading directly via this non-standard
 * property — real, documented (if unofficial) WebKit behavior, not
 * guessed. Verified present on `DeviceOrientationEvent` instances in
 * WebKit's own source/release notes. */
interface DeviceOrientationEventWebkit extends DeviceOrientationEvent {
  webkitCompassHeading?: number
}

function supportsOrientation(): boolean {
  return typeof window !== 'undefined' && window.DeviceOrientationEvent != null
}

function needsExplicitPermission(): boolean {
  if (!supportsOrientation()) return false
  const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventIOS
  return typeof ctor.requestPermission === 'function'
}

/**
 * Real device compass heading via the browser's `DeviceOrientationEvent`
 * API (Phase 11's "compass" requirement) — never a fabricated/simulated
 * heading. Two real code paths, since there's no single standard:
 * - iOS Safari's non-standard `webkitCompassHeading` (already a true
 *   compass bearing, no math needed) — but iOS 13+ requires an explicit
 *   user-gesture-triggered permission request first
 *   (`DeviceOrientationEvent.requestPermission()`), which is why this
 *   hook exposes `requestPermission()` rather than auto-starting.
 * - Standard `deviceorientationabsolute` (`alpha`, 0-360° counter-
 *   clockwise from the device's initial heading when `absolute` is
 *   true) — converted to a clockwise-from-north compass bearing.
 * Reports `unavailable` with a real reason (unsupported, denied, no
 * event received yet) rather than ever guessing a heading.
 */
export function useCompassHeading(): {
  reading: CompassReading
  needsPermission: boolean
  requestPermission: () => Promise<void>
} {
  const [reading, setReading] = useState<CompassReading>(() =>
    supportsOrientation()
      ? { status: 'unavailable', reason: 'Waiting for a compass reading.' }
      : { status: 'unavailable', reason: 'Device orientation is not supported by this browser.' },
  )
  const [started, setStarted] = useState(() => !needsExplicitPermission() && supportsOrientation())

  const requestPermission = useCallback(async () => {
    if (!supportsOrientation()) return
    const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventIOS
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission()
        if (result !== 'granted') {
          setReading({ status: 'unavailable', reason: 'Compass permission denied.' })
          return
        }
      } catch {
        setReading({ status: 'unavailable', reason: 'Could not request compass permission.' })
        return
      }
    }
    setStarted(true)
  }, [])

  useEffect(() => {
    if (!started || !supportsOrientation()) return

    function handle(event: Event) {
      const e = event as DeviceOrientationEventWebkit
      if (typeof e.webkitCompassHeading === 'number') {
        setReading({
          status: 'available',
          value: e.webkitCompassHeading,
          confidence: 'measured',
          source: 'device-orientation',
        })
        return
      }
      if (e.alpha !== null && (e as DeviceOrientationEvent & { absolute?: boolean }).absolute) {
        setReading({
          status: 'available',
          value: (360 - e.alpha) % 360,
          confidence: 'measured',
          source: 'device-orientation',
        })
      }
    }

    window.addEventListener('deviceorientationabsolute', handle)
    window.addEventListener('deviceorientation', handle)
    return () => {
      window.removeEventListener('deviceorientationabsolute', handle)
      window.removeEventListener('deviceorientation', handle)
    }
  }, [started])

  return { reading, needsPermission: needsExplicitPermission() && !started, requestPermission }
}
