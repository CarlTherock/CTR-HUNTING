import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
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

afterEach(async () => {
  vi.clearAllMocks()
  await db.settings.clear()
  useWindStore.setState({
    status: 'idle',
    field: null,
    fetchedAt: null,
    errorReason: null,
    fromCache: false,
    enabled: false,
    selectedHourOffset: 0,
    activeLayer: 'wind',
  })
})

describe('windStore', () => {
  it('records when the field was fetched (so other features can judge its age)', async () => {
    fetchWindField.mockResolvedValue(FIELD)
    const before = Date.now()
    await useWindStore.getState().fetch(BOUNDS)
    const fetchedAt = useWindStore.getState().fetchedAt
    expect(fetchedAt).not.toBeNull()
    expect(Date.parse(fetchedAt as string)).toBeGreaterThanOrEqual(before)
  })

  it('toggle(bounds) enables the layer and fetches a field when none is loaded', async () => {
    fetchWindField.mockResolvedValue(FIELD)

    useWindStore.getState().toggle(BOUNDS)

    expect(useWindStore.getState().enabled).toBe(true)
    expect(fetchWindField).toHaveBeenCalledWith(BOUNDS, 5, expect.any(AbortSignal))
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

  it('ignores an older answer that arrives after a newer request (no stale overwrite)', async () => {
    const older = { ...FIELD, timezone: 'America/Montreal' }
    const release: { older?: (f: WindField) => void } = {}
    fetchWindField
      .mockImplementationOnce(
        () => new Promise<WindField>((resolve) => (release.older = resolve)),
      )
      .mockResolvedValueOnce(FIELD)

    const first = useWindStore.getState().fetch(BOUNDS)
    await useWindStore.getState().fetch(BOUNDS)
    release.older?.(older)
    await first

    expect(useWindStore.getState().field).toEqual(FIELD)
    expect(useWindStore.getState().status).toBe('available')
    // the older request was told to stop
    expect((fetchWindField.mock.calls[0][2] as AbortSignal).aborted).toBe(true)
  })

  it('offline: falls back to the saved copy of the same area, flagged with its fetch date', async () => {
    fetchWindField.mockResolvedValueOnce(FIELD)
    await useWindStore.getState().fetch(BOUNDS)
    const savedAt = useWindStore.getState().fetchedAt
    useWindStore.setState({ field: null, fetchedAt: null, status: 'idle' })

    fetchWindField.mockRejectedValueOnce(new Error('network down'))
    await useWindStore.getState().fetch(BOUNDS)

    const state = useWindStore.getState()
    expect(state.field).toEqual(FIELD)
    expect(state.fromCache).toBe(true)
    expect(state.fetchedAt).toBe(savedAt)
  })

  it('offline: never applies the saved copy to another area', async () => {
    fetchWindField.mockResolvedValueOnce(FIELD)
    await useWindStore.getState().fetch(BOUNDS)
    useWindStore.setState({ field: null, fetchedAt: null, status: 'idle' })

    fetchWindField.mockRejectedValueOnce(new Error('network down'))
    await useWindStore
      .getState()
      .fetch({ west: -80.3, south: 40.7, east: -80.1, north: 40.9 })

    expect(useWindStore.getState().field).toBeNull()
    expect(useWindStore.getState().status).toBe('error')
  })

  it('a failed refresh keeps the field already shown instead of dropping it', async () => {
    fetchWindField.mockResolvedValueOnce(FIELD)
    await useWindStore.getState().fetch(BOUNDS)
    fetchWindField.mockRejectedValueOnce(new Error('network down'))
    await useWindStore.getState().fetch(BOUNDS)

    expect(useWindStore.getState().field).toEqual(FIELD)
    expect(useWindStore.getState().status).toBe('error')
    expect(useWindStore.getState().fromCache).toBe(false)
  })

  it('setSelectedHourOffset clamps to [0, 47]', () => {
    useWindStore.getState().setSelectedHourOffset(99)
    expect(useWindStore.getState().selectedHourOffset).toBe(47)

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
