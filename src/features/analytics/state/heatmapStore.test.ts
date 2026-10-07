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
  vegetationProvider: {
    fetchVegetationGrid: (...args: unknown[]) => fetchVegetationGrid(...args),
  },
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
  useHeatmapStore.setState({
    status: 'idle',
    enabled: false,
    cells: [],
    errorReason: null,
    selectedView: 'combined',
  })
  useWaypointsStore.setState({
    waypoints: [],
    loaded: false,
    isPlacing: false,
    editingId: null,
  })
  useTracksStore.setState({
    tracks: [],
    loaded: false,
    status: 'idle',
    recordingId: null,
    recordingStartedAt: null,
    points: [],
    distanceMeters: 0,
  })
})

describe('heatmapStore', () => {
  it('toggle(bounds) enables the layer and computes 64 real cells (8x8 grid) on first enable', async () => {
    fetchWindField.mockResolvedValue(mockField(64))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(64))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation)
    expect(useHeatmapStore.getState().enabled).toBe(true)

    await vi.waitFor(() => {
      expect(useHeatmapStore.getState().status).toBe('ready')
    })
    expect(useHeatmapStore.getState().cells).toHaveLength(64)
    expect(fetchWindField).toHaveBeenCalledWith(BOUNDS, 8)
    expect(fetchVegetationGrid).toHaveBeenCalledWith(BOUNDS, 8)
    expect(fetchForecast).toHaveBeenCalledOnce() // one point fetch, not one per cell
  })

  it('toggle() off keeps the already-computed cells cached', async () => {
    fetchWindField.mockResolvedValue(mockField(64))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(64))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation)
    await vi.waitFor(() => expect(useHeatmapStore.getState().status).toBe('ready'))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation)

    expect(useHeatmapStore.getState().enabled).toBe(false)
    expect(useHeatmapStore.getState().cells).toHaveLength(64)
  })

  it('toggle() back on does not recompute if cells are already cached', async () => {
    fetchWindField.mockResolvedValue(mockField(64))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(64))

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation) // on
    await vi.waitFor(() => expect(useHeatmapStore.getState().status).toBe('ready'))
    useHeatmapStore.getState().toggle(BOUNDS, queryElevation) // off
    fetchWindField.mockClear()

    useHeatmapStore.getState().toggle(BOUNDS, queryElevation) // on again

    expect(fetchWindField).not.toHaveBeenCalled()
  })

  it('one failing source (e.g. Overpass busy) no longer blanks the whole heatmap', async () => {
    fetchWindField.mockResolvedValue(mockField(64))
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockRejectedValue(new Error('Overpass 504'))

    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)

    const state = useHeatmapStore.getState()
    expect(state.status).toBe('ready')
    expect(state.unavailableSources).toEqual(['Végétation'])
    const vegetation = state.cells[0].combined.results.find(
      (r) => r.analyzer === 'vegetation',
    )
    expect(vegetation?.score).toBeNull()
    expect(state.computedBounds).toEqual(BOUNDS)
  })

  it('reports a real error state when every source fails, rather than showing fabricated cells', async () => {
    fetchWindField.mockRejectedValue(new Error('network down'))
    fetchForecast.mockRejectedValue(new Error('network down'))
    fetchVegetationGrid.mockRejectedValue(new Error('network down'))

    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)

    expect(useHeatmapStore.getState().status).toBe('error')
    expect(useHeatmapStore.getState().errorReason).toContain('aucune source')
  })

  it('uses the current hour of the wind field, not the midnight sample at index 0', async () => {
    const { localHourKey } = await import('@/utils/windField')
    const nowKey = localHourKey(new Date(), 'America/Toronto')
    const field = {
      timezone: 'America/Toronto',
      samples: Array.from({ length: 64 }, (_, i) => ({
        coordinate: { lat: 46.7 + i * 0.001, lng: -71.3 + i * 0.001 },
        hourly: [
          { ...WIND_HOURLY, time: '2000-01-01T00:00', speedKmh: 99 },
          { ...WIND_HOURLY, time: nowKey, speedKmh: 12 },
        ],
      })),
    }
    fetchWindField.mockResolvedValue(field)
    fetchForecast.mockResolvedValue(WEATHER)
    fetchVegetationGrid.mockResolvedValue(mockVegetation(64))

    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)

    const wind = useHeatmapStore
      .getState()
      .cells[0].combined.results.find((r) => r.analyzer === 'wind')
    expect(wind?.score).not.toBeNull()
    expect(JSON.stringify(wind?.factors)).toContain('12')
    expect(JSON.stringify(wind?.factors)).not.toContain('99')
  })

  it('setSelectedView switches which score the heatmap is configured to show, defaulting to combined', () => {
    expect(useHeatmapStore.getState().selectedView).toBe('combined')

    useHeatmapStore.getState().setSelectedView('wind')

    expect(useHeatmapStore.getState().selectedView).toBe('wind')
  })
})
