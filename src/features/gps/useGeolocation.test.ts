import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useGeolocation } from './useGeolocation'

type SuccessCallback = (position: GeolocationPosition) => void
type ErrorCallback = (error: GeolocationPositionError) => void

describe('useGeolocation', () => {
  const clearWatch = vi.fn()
  let successCallback: SuccessCallback
  let errorCallback: ErrorCallback | undefined
  const watchPosition = vi.fn((onSuccess: SuccessCallback, onError?: ErrorCallback) => {
    successCallback = onSuccess
    errorCallback = onError
    return 1
  })

  beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { watchPosition, clearWatch },
      configurable: true,
    })
  })

  afterEach(() => {
    // Not deleting navigator.geolocation here: Testing Library's global
    // cleanup() (src/test/setup.ts) unmounts after this hook runs, and the
    // effect's cleanup calls navigator.geolocation.clearWatch — it needs
    // to still exist then. beforeEach redefines it fresh for every test.
    vi.clearAllMocks()
  })

  it('starts unavailable, waiting for a first fix', () => {
    const { result } = renderHook(() => useGeolocation())
    expect(result.current).toEqual({ status: 'unavailable', reason: 'Waiting for a GPS fix.' })
  })

  it('reports a real fix as measured, available data', async () => {
    const { result } = renderHook(() => useGeolocation())

    successCallback({
      coords: { latitude: 46.8, longitude: -71.2, altitude: 90, accuracy: 8 },
    } as GeolocationPosition)

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'available',
        value: { lat: 46.8, lng: -71.2, altitude: 90, accuracyMeters: 8 },
        confidence: 'measured',
        source: 'browser-geolocation',
      }),
    )
  })

  it('represents a denied/failed fix as unavailable with the browser reason, never fabricated', async () => {
    const { result } = renderHook(() => useGeolocation())

    errorCallback?.({ message: 'User denied Geolocation' } as GeolocationPositionError)

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'unavailable',
        reason: 'User denied Geolocation',
      }),
    )
  })

  it('clears the watch on unmount', () => {
    const { unmount } = renderHook(() => useGeolocation())
    unmount()
    expect(clearWatch).toHaveBeenCalledWith(1)
  })
})
