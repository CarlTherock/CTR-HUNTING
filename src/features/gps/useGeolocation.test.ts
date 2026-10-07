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
    expect(result.current).toEqual({
      status: 'unavailable',
      kind: 'searching',
      reason: 'En attente d’un signal GPS.',
    })
  })

  it('reports a real fix as measured, available data', async () => {
    const { result } = renderHook(() => useGeolocation())

    successCallback({
      coords: { latitude: 46.8, longitude: -71.2, altitude: 90, accuracy: 8 },
      timestamp: 1_700_000_000_000,
    } as GeolocationPosition)

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'available',
        value: {
          lat: 46.8,
          lng: -71.2,
          altitude: 90,
          accuracyMeters: 8,
          timestampMs: 1_700_000_000_000,
          courseDegrees: undefined,
          speedMps: undefined,
        },
        confidence: 'measured',
        source: 'browser-geolocation',
      }),
    )
  })

  it('carries the fix time and the travel course/speed only when finite', async () => {
    const { result } = renderHook(() => useGeolocation())

    successCallback({
      coords: {
        latitude: 46.8,
        longitude: -71.2,
        altitude: null,
        accuracy: 5,
        heading: 270,
        speed: 1.4,
      },
      timestamp: 1234,
    } as GeolocationPosition)
    await waitFor(() => expect(result.current.status).toBe('available'))
    expect(result.current).toMatchObject({
      value: { timestampMs: 1234, courseDegrees: 270, speedMps: 1.4 },
    })

    successCallback({
      coords: {
        latitude: 46.8,
        longitude: -71.2,
        altitude: null,
        accuracy: 5,
        heading: Number.NaN,
        speed: null,
      },
      timestamp: 1235,
    } as GeolocationPosition)
    await waitFor(() =>
      expect(result.current).toMatchObject({ value: { timestampMs: 1235 } }),
    )
    const value = (result.current as unknown as { value: Record<string, unknown> }).value
    expect(value.courseDegrees).toBeUndefined()
    expect(value.speedMps).toBeUndefined()
  })

  it('represents a denied/failed fix as unavailable with the browser reason, never fabricated', async () => {
    const { result } = renderHook(() => useGeolocation())

    errorCallback?.({ message: 'User denied Geolocation' } as GeolocationPositionError)

    await waitFor(() =>
      expect(result.current).toEqual({
        status: 'unavailable',
        kind: 'unavailable',
        reason: 'User denied Geolocation',
      }),
    )
  })

  it.each([
    [1, 'denied', 'Autorisation de localisation refusée.'],
    [2, 'unavailable', 'Position indisponible pour le moment.'],
    [3, 'timeout', 'Délai dépassé en attendant le signal GPS.'],
  ] as const)('maps PositionError code %i to kind %s', async (code, kind, reason) => {
    const { result } = renderHook(() => useGeolocation())

    errorCallback?.({ code, message: 'x' } as GeolocationPositionError)

    await waitFor(() =>
      expect(result.current).toEqual({ status: 'unavailable', kind, reason }),
    )
  })

  it('reports unsupported (never a default position) without navigator.geolocation', () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    })
    // `'geolocation' in navigator` stays true with an undefined value, so
    // remove the own property to emulate a browser without the API.
    delete (navigator as unknown as Record<string, unknown>).geolocation
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'geolocation')
    if (original) {
      delete (Navigator.prototype as unknown as Record<string, unknown>).geolocation
    }
    try {
      const { result } = renderHook(() => useGeolocation())
      expect(result.current).toMatchObject({ status: 'unavailable', kind: 'unsupported' })
    } finally {
      if (original) Object.defineProperty(Navigator.prototype, 'geolocation', original)
    }
  })

  it('clears the watch on unmount', () => {
    const { unmount } = renderHook(() => useGeolocation())
    unmount()
    expect(clearWatch).toHaveBeenCalledWith(1)
  })
})
