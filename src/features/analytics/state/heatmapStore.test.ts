import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHeatmapStore } from './heatmapStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'

const fetchWindField = vi.fn()
vi.mock('@/services/wind', () => ({
  windProvider: { fetchWindField: (...args: unknown[]) => fetchWindField(...args) },
}))

const fetchForecast = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchForecast: (...args: unknown[]) => fetchForecast(...args) },
}))

const fetchVegetationGrid = vi.fn()
vi.mock('@/services/vegetation', () => ({
  vegetationProvider: { fetchVegetationGrid: (...args: unknown[]) => fetchVegetationGrid(...args) },
}))

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }
const queryElevation = () => 300

const WIND_HOURLY = {
  time: '2026-08-17T10:00',
  directionDegrees: 270,
  speedKmh: 12,
  gustsKmh: 20,
  temperatureCelsius: 18,
  precipitationMm: 0,
  cloudCoverPercent: 30,
}
const WEATHER = {
  timezone: 'America/Toronto',
  current: {
    timestamp: '2026-08-17T10:00',
    temperatureCelsius: 18,
    relativeHumidityPercent: 55,
    surfacePressureHpa: 1013,
    precipitationMm: 0,
    cloudCoverPercent: 30,
    windSpeedKmh: 10,
    windGustsKmh: 15,
    visibilityMeters: 20000,
  },
  hourly: [],
}

function mockField(sampleCount: number) {
  return {
    timezone: 'America/Toronto',
    samples: Array.from({ length: sampleCount }, (_, i) => ({
      coordinate: { lat: 46.7 + i * 0.01, lng: -71.3 + i * 0.01 },
      hourly: [WIND_HOURLY],
    })),
  }
}

function mockVegetation(sampleCount: number) {
  return Array.from({ length: sampleCount }, (_, i) => ({
    coordinate: { lat: 46.7 + i * 0.01, lng: -71.3 + i * 0.01 },
    radiusMeters: 100,
    categoryCounts: { forest: 1 },
    source: 'openstreetmap' as const,
  }))
}

afterEach(() => {
  vi.clearAllMocks()
  useHeatmapStore.setState({ status: 'idle', enabled: false, cells: [], errorReason: null, selectedView: 'combined' })
  useWaypointsStore.setState({ waypoints: [], loaded: false, isPlacing: false, editingId: null })
  useTracksStore.setState({ tracks: [], loaded: false, status: 'idle', recordingId: null, recordingStartedAt: null, points: [], distanceMeters: 0 })
})

describe('heatmapStore', () => {
  it('toggle(bounds) enables the layer and computes 25 real cells (5x5 grid) on first enable', async () => {
    fetchWindField.mockResolvedValue(mockField(25))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(25))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation)
    expect(useHeatmapStore.getState().enabled).toBe(true)

    await vi.waitFor(() => {
      expect(useHeatmapStore.getState().status).toBe('ready')
    })
    expect(useHeatmapStore.getState().cells).toHaveLength(25)
    expect(fetchWindField).toHaveBeenCalledWith(BOUNDS, 5)
    expect(fetchVegetationGrid).toHaveBeenCalledWith(BOUNDS, 5)
    expect(fetchForecast).toHaveBeenCalledOnce() // one point fetch, not one per cell
  })

  it('toggle() off keeps the already-computed cells cached', async () => {
    fetchWindField.mockResolvedValue(mockField(25))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(25))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation)
    await vi.waitFor(() => expect(useHeatmapStore.getState().status).toBe('ready'))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation)

    expect(useHeatmapStore.getState().enabled).toBe(false)
    expect(useHeatmapStore.getState().cells).toHaveLength(25)
  })

  it('toggle() back on does not recompute if cells are already cached', async () => {
    fetchWindField.mockResolvedValue(mockField(25))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(25))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation) // on
    await vi.waitFor(() => expect(useHeatmapStore.getState().status).toBe('ready'))
    useHeatmapStore.getState().toggle(BOUNDS, queryElevation) // off
    fetchWindField.mockClear()

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation) // on again

    expect(fetchWindField).not.toHaveBeenCalled()
  })

  it('reports a real error state when a fetch fails, rather than showing stale/fabricated cells', async () => {
    fetchWindField.mockRejectedValue(new Error('network down'))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(25))

    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)

    expect(useHeatmapStore.getState().status).toBe('error')
    expect(useHeatmapStore.getState().errorReason).toBe('network down')
  })

  it('setSelectedView switches which score the heatmap is configured to show, defaulting to combined', () => {
    expect(useHeatmapStore.getState().selectedView).toBe('combined')

    useHeatmapStore.getState().setSelectedView('wind')

    expect(useHeatmapStore.getState().selectedView).toBe('wind')
  })
})
