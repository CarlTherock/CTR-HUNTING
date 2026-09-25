import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWeatherMapStore } from './weatherMapStore'

const fetchFrames = vi.fn()
const fetchValueAt = vi.fn()
vi.mock('@/services/weather-map', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/weather-map')>()
  return {
    ...actual,
    weatherMapProvider: {
      fetchFrames: (...args: unknown[]) => fetchFrames(...args),
      fetchValueAt: (...args: unknown[]) => fetchValueAt(...args),
    },
  }
})

const RADAR = [
  { time: '2026-09-25T14:36:00Z', kind: 'observed' },
  { time: '2026-09-25T14:48:00Z', kind: 'observed' },
  { time: '2026-09-25T15:00:00Z', kind: 'observed' },
]
const TEMP = [
  { time: '2026-09-25T15:00:00Z', kind: 'forecast' },
  { time: '2026-09-25T16:00:00Z', kind: 'forecast' },
]

describe('weatherMapStore', () => {
  beforeEach(() => {
    fetchFrames.mockReset()
    fetchValueAt.mockReset()
    useWeatherMapStore.setState({
      enabled: false,
      activeLayer: 'radar',
      status: 'idle',
      frames: [],
      frameIndex: 0,
      playing: false,
      cache: {},
      centerValue: null,
    })
  })

  it('enabling loads radar frames and selects the latest real image', async () => {
    fetchFrames.mockResolvedValue(RADAR)
    useWeatherMapStore.getState().setEnabled(true)
    await vi.waitFor(() => expect(useWeatherMapStore.getState().status).toBe('available'))
    expect(useWeatherMapStore.getState().frameIndex).toBe(2)
  })

  it('switching to a forecast layer starts on the current hour, and caches frames', async () => {
    fetchFrames.mockResolvedValueOnce(RADAR).mockResolvedValueOnce(TEMP)
    await useWeatherMapStore.getState().loadFrames()
    await useWeatherMapStore.getState().setLayer('temperature')
    expect(useWeatherMapStore.getState().frameIndex).toBe(0)
    await useWeatherMapStore.getState().setLayer('radar')
    expect(fetchFrames).toHaveBeenCalledTimes(2)
  })

  it('step wraps around for looping playback', async () => {
    fetchFrames.mockResolvedValue(RADAR)
    await useWeatherMapStore.getState().loadFrames()
    useWeatherMapStore.getState().step(1)
    expect(useWeatherMapStore.getState().frameIndex).toBe(0)
  })

  it('surfaces a real error instead of empty frames silently', async () => {
    fetchFrames.mockRejectedValue(new Error('GeoMet a répondu 503'))
    await useWeatherMapStore.getState().loadFrames()
    expect(useWeatherMapStore.getState().status).toBe('error')
    expect(useWeatherMapStore.getState().errorReason).toContain('503')
  })

  it('reads the real value at the map center for the current frame', async () => {
    fetchFrames.mockResolvedValue(RADAR)
    fetchValueAt.mockResolvedValue('Pluie 1,2 mm/h')
    await useWeatherMapStore.getState().loadFrames()
    await useWeatherMapStore.getState().fetchCenterValue({ lat: 46, lng: -72 })
    expect(fetchValueAt.mock.calls[0][1]).toBe('2026-09-25T15:00:00Z')
    expect(useWeatherMapStore.getState().centerValue).toBe('Pluie 1,2 mm/h')
  })
})
