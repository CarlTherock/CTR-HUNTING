import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWindStore } from './windStore'
import type { WindField } from '@/types'

const fetchWindField = vi.fn()
vi.mock('@/services/wind', () => ({
  windProvider: { fetchWindField: (...args: unknown[]) => fetchWindField(...args) },
}))

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

const FIELD: WindField = {
  timezone: 'America/Toronto',
  samples: [
    {
      coordinate: { lat: 46.8, lng: -71.2 },
      hourly: [
        {
          time: '2026-08-17T10:00',
          directionDegrees: 270,
          speedKmh: 12,
          gustsKmh: 20,
          temperatureCelsius: 18,
          precipitationMm: 0,
          cloudCoverPercent: 30,
        },
        {
          time: '2026-08-17T11:00',
          directionDegrees: 280,
          speedKmh: 14,
          gustsKmh: 22,
          temperatureCelsius: 19,
          precipitationMm: 0.1,
          cloudCoverPercent: 40,
        },
      ],
    },
  ],
}

afterEach(() => {
  vi.clearAllMocks()
  useWindStore.setState({
    status: 'idle',
    field: null,
    errorReason: null,
    enabled: false,
    selectedHourOffset: 0,
    activeLayer: 'wind',
  })
})

describe('windStore', () => {
  it('toggle(bounds) enables the layer and fetches a field when none is loaded', async () => {
    fetchWindField.mockResolvedValue(FIELD)

    useWindStore.getState().toggle(BOUNDS)

    expect(useWindStore.getState().enabled).toBe(true)
    expect(fetchWindField).toHaveBeenCalledWith(BOUNDS, 5)
  })

  it('toggle() off does not discard an already-fetched field', async () => {
    fetchWindField.mockResolvedValue(FIELD)
    await useWindStore.getState().fetch(BOUNDS)
    useWindStore.getState().toggle(BOUNDS)
    expect(useWindStore.getState().enabled).toBe(true)

    useWindStore.getState().toggle(BOUNDS)

    expect(useWindStore.getState().enabled).toBe(false)
    expect(useWindStore.getState().field).toEqual(FIELD)
  })

  it('toggle() back on does not re-fetch if a field is already loaded', async () => {
    fetchWindField.mockResolvedValue(FIELD)
    await useWindStore.getState().fetch(BOUNDS)
    fetchWindField.mockClear()

    useWindStore.getState().toggle(BOUNDS) // on
    useWindStore.getState().toggle(BOUNDS) // off
    useWindStore.getState().toggle(BOUNDS) // on again

    expect(fetchWindField).not.toHaveBeenCalled()
  })

  it('fetch stores a real field on success', async () => {
    fetchWindField.mockResolvedValue(FIELD)

    await useWindStore.getState().fetch(BOUNDS)

    expect(useWindStore.getState().status).toBe('available')
    expect(useWindStore.getState().field).toEqual(FIELD)
  })

  it('fetch reports a real error state on failure', async () => {
    fetchWindField.mockRejectedValue(new Error('network down'))

    await useWindStore.getState().fetch(BOUNDS)

    expect(useWindStore.getState().status).toBe('error')
    expect(useWindStore.getState().errorReason).toBe('network down')
  })

  it('setSelectedHourOffset clamps to [0, 23]', () => {
    useWindStore.getState().setSelectedHourOffset(99)
    expect(useWindStore.getState().selectedHourOffset).toBe(23)

    useWindStore.getState().setSelectedHourOffset(-5)
    expect(useWindStore.getState().selectedHourOffset).toBe(0)
  })

  it('windAt returns the real reading nearest a coordinate at the selected hour, or null with no field', async () => {
    expect(useWindStore.getState().windAt({ lat: 46.8, lng: -71.2 })).toBeNull()

    fetchWindField.mockResolvedValue(FIELD)
    await useWindStore.getState().fetch(BOUNDS)
    useWindStore.getState().setSelectedHourOffset(1)

    expect(useWindStore.getState().windAt({ lat: 46.8, lng: -71.2 })).toEqual({
      time: '2026-08-17T11:00',
      directionDegrees: 280,
      speedKmh: 14,
      gustsKmh: 22,
      temperatureCelsius: 19,
      precipitationMm: 0.1,
      cloudCoverPercent: 40,
    })
  })

  it('setActiveLayer switches which weather layer is rendered, defaulting to wind', () => {
    expect(useWindStore.getState().activeLayer).toBe('wind')

    useWindStore.getState().setActiveLayer('temperature')

    expect(useWindStore.getState().activeLayer).toBe('temperature')
  })
})
