import { expect, vi } from 'vitest'

/**
 * Replaces every browser API that can trigger a permission prompt (position,
 * camera, iOS compass) with a spy, so a test can prove that a screen asks for
 * nothing. Call `restore()` afterwards.
 */
export function installPermissionSpies() {
  const spies = {
    watchPosition: vi.fn(),
    getCurrentPosition: vi.fn(),
    getUserMedia: vi.fn(),
    compassPermission: vi.fn(),
  }

  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: spies.watchPosition,
      getCurrentPosition: spies.getCurrentPosition,
      clearWatch: vi.fn(),
    },
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: spies.getUserMedia },
  })
  const previousOrientation = (window as unknown as Record<string, unknown>)
    .DeviceOrientationEvent
  Object.defineProperty(window, 'DeviceOrientationEvent', {
    configurable: true,
    writable: true,
    value: { requestPermission: spies.compassPermission },
  })

  return {
    ...spies,
    expectNoPermissionAsked() {
      expect(spies.watchPosition).not.toHaveBeenCalled()
      expect(spies.getCurrentPosition).not.toHaveBeenCalled()
      expect(spies.getUserMedia).not.toHaveBeenCalled()
      expect(spies.compassPermission).not.toHaveBeenCalled()
    },
    restore() {
      Reflect.deleteProperty(navigator, 'geolocation')
      Reflect.deleteProperty(navigator, 'mediaDevices')
      if (previousOrientation === undefined) {
        Reflect.deleteProperty(window, 'DeviceOrientationEvent')
      } else {
        Object.defineProperty(window, 'DeviceOrientationEvent', {
          configurable: true,
          writable: true,
          value: previousOrientation,
        })
      }
    },
  }
}
