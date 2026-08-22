import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapPage } from './MapPage'
import { useLayersStore } from '@/features/layers/state/layersStore'
import { useMapStore } from '../state/mapStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useTerrainToolsStore } from '../state/terrainToolsStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { useAnalysisStore } from '@/features/analytics/state/analysisStore'
import { useHeatmapStore } from '@/features/analytics/state/heatmapStore'
import { useFieldModeStore } from '@/features/field-mode/state/fieldModeStore'
import { db } from '@/database/db'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { CreateMapOptions } from '@/services/map'

// jsdom has no WebGL context, so MapLibre GL JS cannot run in tests — the
// point of the MapProvider adapter is that feature code (and its tests)
// never need to know that; we mock the adapter, not the map engine.
const destroy = vi.fn()
const setBaseLayer = vi.fn()
const setOverlayVisible = vi.fn()
const setView = vi.fn()
const setUserLocationMarker = vi.fn()
const setWaypoints = vi.fn()
const setTrackPreview = vi.fn()
const setMeasurePath = vi.fn()
const setWindField = vi.fn()
const setAnalysisHeatmap = vi.fn()
const setTerrainEnabled = vi.fn()
const queryElevation = vi.fn(() => null as number | null)
const getBounds = vi.fn(() => ({ west: -71.3, south: 46.7, east: -71.1, north: 46.9 }))
const downloadArea = vi
  .fn()
  .mockResolvedValue({ tilesDownloaded: 4, bytesDownloaded: 40_000, tileUrls: ['a', 'b', 'c', 'd'] })
let lastCreateMapOptions: CreateMapOptions | undefined
const createMap = vi.fn((options: CreateMapOptions) => {
  lastCreateMapOptions = options
  return {
    setView,
    setBaseLayer,
    setOverlayVisible,
    setUserLocationMarker,
    setWaypoints,
    setTrackPreview,
    setMeasurePath,
    setWindField,
    setAnalysisHeatmap,
    setTerrainEnabled,
    queryElevation,
    getBounds,
    downloadArea,
    destroy,
  }
})

let mockProvider: { createMap: typeof createMap } | null = { createMap }

vi.mock('@/services/map', () => ({
  get mapProvider() {
    return mockProvider
  },
  availableBaseLayers: [
    'outdoor',
    'satellite',
    'esri-topographic',
    'esri-imagery',
    'esri-imagery-standard',
    'esri-terrain',
    'esri-hillshade',
    'esri-light-gray',
    'esri-dark-gray',
    'esri-navigation',
  ],
}))

const fetchWindField = vi.fn().mockResolvedValue({
  timezone: 'America/Toronto',
  samples: [
    {
      coordinate: { lat: 46.8139, lng: -71.208 },
      hourly: [
        {
          time: '2026-08-17T10:00',
          directionDegrees: 270,
          speedKmh: 12,
          gustsKmh: 20,
          temperatureCelsius: 18,
          precipitationMm: 0,
          cloudCoverPercent: 40,
        },
      ],
    },
  ],
})
vi.mock('@/services/wind', () => ({
  windProvider: { fetchWindField: (...args: unknown[]) => fetchWindField(...args) },
}))

const fetchForecast = vi.fn().mockResolvedValue({
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
})
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchForecast: (...args: unknown[]) => fetchForecast(...args) },
}))

const fetchVegetation = vi.fn().mockResolvedValue({
  coordinate: { lat: 46.8139, lng: -71.208 },
  radiusMeters: 300,
  categoryCounts: { forest: 2 },
  source: 'openstreetmap',
})
const fetchVegetationGrid = vi.fn().mockResolvedValue(
  Array.from({ length: 25 }, () => ({
    coordinate: { lat: 46.8139, lng: -71.208 },
    radiusMeters: 100,
    categoryCounts: { forest: 1 },
    source: 'openstreetmap',
  })),
)
vi.mock('@/services/vegetation', () => ({
  vegetationProvider: {
    fetchVegetation: (...args: unknown[]) => fetchVegetation(...args),
    fetchVegetationGrid: (...args: unknown[]) => fetchVegetationGrid(...args),
  },
}))

let mockGpsReading: GeolocationReading = {
  status: 'unavailable',
  reason: 'Geolocation is not supported by this browser.',
}

vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => mockGpsReading,
}))

afterEach(async () => {
  vi.clearAllMocks()
  mockProvider = { createMap }
  mockGpsReading = { status: 'unavailable', reason: 'Geolocation is not supported by this browser.' }
  useLayersStore.setState({
    baseLayer: 'outdoor',
    overlays: { trails: true, hydrography: true, contours: true },
  })
  useMapStore.setState({
    view: { center: { lat: 46.8139, lng: -71.208 }, zoom: 6, pitch: 0, bearing: 0 },
    terrainExaggeration: 2,
  })
  useTerrainToolsStore.setState({
    mode: 'idle',
    queryResult: null,
    profilePoints: [],
    profileData: null,
  })
  useWindStore.setState({
    status: 'idle',
    field: null,
    errorReason: null,
    enabled: false,
    selectedHourOffset: 0,
  })
  useAnalysisStore.setState({ mode: 'idle', status: 'idle', coordinate: null, combined: null, errorReason: null, recent: [] })
  useHeatmapStore.setState({ status: 'idle', enabled: false, cells: [], errorReason: null, selectedView: 'combined' })
  useFieldModeStore.setState({ enabled: false, loaded: true })
  useWaypointsStore.setState({ waypoints: [], loaded: false, isPlacing: false, editingId: null })
  useTracksStore.setState({
    tracks: [],
    loaded: false,
    status: 'idle',
    recordingId: null,
    recordingStartedAt: null,
    points: [],
    distanceMeters: 0,
  })
  useOfflineStore.setState({
    areas: [],
    loaded: false,
    mode: 'idle',
    extraZoomLevels: 2,
    selectedBounds: null,
    selectedZoom: null,
    activeAreaId: null,
    downloadProgress: null,
  })
  await db.waypoints.clear()
  await db.tracks.clear()
  await db.offlineAreas.clear()
  await db.settings.delete('fieldModeEnabled')
  lastCreateMapOptions = undefined
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
})

describe('MapPage', () => {
  it('mounts the map via the provider adapter and tears it down on unmount', () => {
    const { unmount } = render(<MapPage />)

    expect(screen.getByTestId('map-container')).toBeInTheDocument()
    expect(createMap).toHaveBeenCalledOnce()
    expect(createMap).toHaveBeenCalledWith(
      expect.objectContaining({ initialBaseLayer: 'outdoor' }),
    )

    unmount()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('shows an explicit unavailable state when no provider is configured', () => {
    mockProvider = null
    render(<MapPage />)

    expect(screen.getByText('Map unavailable')).toBeInTheDocument()
    expect(createMap).not.toHaveBeenCalled()
  })

  it('switches the base layer via the layer manager panel without recreating the map', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('radio', { name: 'Satellite' }))

    expect(setBaseLayer).toHaveBeenCalledOnce()
    expect(setBaseLayer).toHaveBeenCalledWith('satellite')
    expect(createMap).toHaveBeenCalledOnce()
  })

  it('shows an unavailable GPS badge and a disabled locate button with no fix', () => {
    render(<MapPage />)

    expect(screen.getByText('GPS unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Center on my position' })).toBeDisabled()
  })

  it('shows the accuracy badge, marks the map and recenters on a real GPS fix', async () => {
    mockGpsReading = {
      status: 'available',
      value: { lat: 46.8, lng: -71.2, accuracyMeters: 12 },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    const user = userEvent.setup()
    render(<MapPage />)

    expect(screen.getByText('GPS ±12 m')).toBeInTheDocument()
    expect(setUserLocationMarker).toHaveBeenCalledWith({ lat: 46.8, lng: -71.2, accuracyMeters: 12 })

    const locateButton = screen.getByRole('button', { name: 'Center on my position' })
    expect(locateButton).toBeEnabled()

    await user.click(locateButton)
    // Recenter also zooms in to a useful field scale (never out) — the
    // fixture's default viewport zoom (6) is well below that floor.
    expect(setView).toHaveBeenCalledWith({ center: { lat: 46.8, lng: -71.2 }, zoom: 16 })
  })

  it('toggles an overlay via the layer manager panel', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    const contoursToggle = screen.getByRole('checkbox', { name: 'Contour lines' })
    expect(contoursToggle).toBeEnabled()

    await user.click(contoursToggle)

    expect(setOverlayVisible).toHaveBeenCalledOnce()
    expect(setOverlayVisible).toHaveBeenCalledWith('contours', false)
  })

  it('disables overlay toggles while the Satellite base layer is active', () => {
    useLayersStore.setState({ baseLayer: 'satellite' })
    render(<MapPage />)

    expect(screen.getByRole('checkbox', { name: 'Contour lines' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Trails' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Hydrography' })).toBeDisabled()
  })

  it('switches to the 3D camera preset and back without recreating the map', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    const button3D = screen.getByRole('button', { name: '3D' })
    const button2D = screen.getByRole('button', { name: '2D' })
    expect(button2D).toHaveAttribute('aria-pressed', 'true')

    await user.click(button3D)
    expect(setView).toHaveBeenCalledWith({ pitch: 80, bearing: -20 })
    expect(button3D).toHaveAttribute('aria-pressed', 'true')

    await user.click(button2D)
    expect(setView).toHaveBeenCalledWith({ pitch: 0, bearing: 0 })
    expect(createMap).toHaveBeenCalledOnce()
  })

  it('enables real terrain relief when switching to 3D, and disables it back in 2D', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: '3D' }))
    expect(setTerrainEnabled).toHaveBeenLastCalledWith(true, 2)

    await user.click(screen.getByRole('button', { name: '2D' }))
    expect(setTerrainEnabled).toHaveBeenLastCalledWith(false, 2)
  })

  it('the exaggeration stepper only appears in 3D, and updates the engine live', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    expect(screen.queryByLabelText('More terrain exaggeration')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '3D' }))
    await user.click(screen.getByRole('button', { name: 'More terrain exaggeration' }))

    expect(setTerrainEnabled).toHaveBeenLastCalledWith(true, 3)
    expect(screen.getByText('3×')).toBeInTheDocument()
  })

  it('queries elevation/slope/aspect at a tapped point via the terrain info tool', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(312)
    render(<MapPage />)

    await user.click(
      screen.getByRole('button', { name: 'Get elevation, slope and aspect at a point' }),
    )
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })

    expect(await screen.findByText('312 m')).toBeInTheDocument()
    expect(queryElevation).toHaveBeenCalledWith({ lat: 46.8, lng: -71.2 })
  })

  it('draws an elevation profile from tapped points and shows the chart panel', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await user.click(
      screen.getByRole('button', { name: 'Draw a path to see its elevation profile' }),
    )
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })
    lastCreateMapOptions?.onMapClick?.({ lat: 46.81, lng: -71.2 })

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByText('Elevation profile')).toBeInTheDocument()
  })

  it('shows each tapped elevation-profile point on the map immediately, and clears them on discard', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(
      screen.getByRole('button', { name: 'Draw a path to see its elevation profile' }),
    )
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })
    await vi.waitFor(() => {
      expect(setMeasurePath).toHaveBeenLastCalledWith([{ lat: 46.8, lng: -71.2 }])
    })

    lastCreateMapOptions?.onMapClick?.({ lat: 46.81, lng: -71.2 })
    await vi.waitFor(() => {
      expect(setMeasurePath).toHaveBeenLastCalledWith([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.81, lng: -71.2 },
      ])
    })

    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Discard' }))

    expect(setMeasurePath).toHaveBeenLastCalledWith(null)
  })

  it('arms placing mode, creates a real waypoint on the next map click, and opens it for editing', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    expect(screen.getByText('Tap the map to place a waypoint')).toBeInTheDocument()

    // Simulate the map-engine click callback MapPage wired into createMap
    // — there's no real MapLibre canvas to click in jsdom. onMapClick
    // fires the (async) placeWaypointAt without awaiting it itself, so
    // wait for its effect (the edit panel opening) rather than the call.
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })

    expect(await screen.findByRole('heading', { name: 'Waypoint' })).toBeInTheDocument()
    expect(screen.queryByText('Tap the map to place a waypoint')).not.toBeInTheDocument()
    expect(setWaypoints).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ coordinate: { lat: 46.8, lng: -71.2 } })]),
    )

    const persisted = await db.waypoints.toArray()
    expect(persisted).toHaveLength(1)
  })

  it('opens the edit panel for an existing waypoint via onWaypointClick, and deletes it', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    await lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })
    const [waypoint] = await db.waypoints.toArray()

    // Close the auto-opened editor, then reopen via onWaypointClick — as a
    // real marker click would.
    await user.click(screen.getByRole('button', { name: 'Close without saving' }))
    expect(screen.queryByRole('heading', { name: 'Waypoint' })).not.toBeInTheDocument()

    lastCreateMapOptions?.onWaypointClick?.(waypoint.id)
    expect(await screen.findByRole('heading', { name: 'Waypoint' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await vi.waitFor(async () => {
      expect(await db.waypoints.toArray()).toEqual([])
    })
    // deleteWaypoint now also awaits deletePhotosForWaypoint before
    // clearing editingId, one more microtask hop than the Dexie write
    // alone — wait for the effect rather than asserting immediately.
    await vi.waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Waypoint' })).not.toBeInTheDocument()
    })
  })

  it('persists a waypoint drag via onWaypointDragEnd (drag-to-move)', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })
    expect(await screen.findByRole('heading', { name: 'Waypoint' })).toBeInTheDocument()
    const [waypoint] = await db.waypoints.toArray()

    lastCreateMapOptions?.onWaypointDragEnd?.(waypoint.id, { lat: 47.1, lng: -72.5 })

    // updateWaypoint is async — wait for the persisted write rather than
    // asserting immediately after the synchronous callback.
    await vi.waitFor(async () => {
      const [reloaded] = await db.waypoints.toArray()
      expect(reloaded.coordinate).toEqual({ lat: 47.1, lng: -72.5 })
    })
  })

  it('saves per-waypoint optimal wind octants and flags whether the live wind matches', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Add waypoint' }))
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8139, lng: -71.208 })
    expect(await screen.findByRole('heading', { name: 'Waypoint' })).toBeInTheDocument()

    // Turn the wind layer on so the live reading (mocked to blow from
    // 270°/W) is available for the "matches now" badge.
    await user.click(screen.getByRole('button', { name: 'Toggle wind flow field' }))
    await vi.waitFor(() => {
      expect(screen.getAllByRole('img', { name: 'Wind compass' }).length).toBeGreaterThan(0)
    })

    // Mark north as optimal — the live wind (W) should read as a mismatch.
    await user.click(screen.getByRole('button', { name: 'N' }))
    expect(await screen.findByText('W now')).toHaveClass('text-status-danger')

    // Mark west too — now the live wind matches.
    await user.click(screen.getByRole('button', { name: 'W' }))
    expect(await screen.findByText('W now')).toHaveClass('text-status-success')

    await user.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(async () => {
      const [waypoint] = await db.waypoints.toArray()
      expect(waypoint.optimalWindDirections).toEqual(expect.arrayContaining([0, 270]))
    })
  })

  it('starts a GPS track recording and mirrors the live preview onto the map', async () => {
    const user = userEvent.setup()
    mockGpsReading = {
      status: 'available',
      value: { lat: 46.8, lng: -71.2, accuracyMeters: 5 },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Record a GPS track' }))
    expect(screen.getByText('● Recording')).toBeInTheDocument()

    // The GPS effect (already firing on mount, since mockGpsReading is
    // 'available' from the start) feeds the recording — confirm the map
    // gets the live line, not just the store.
    expect(setTrackPreview).toHaveBeenLastCalledWith([
      expect.objectContaining({ lat: 46.8, lng: -71.2 }),
    ])
  })

  it('clears the map track preview once recording stops', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Record a GPS track' }))
    await user.click(screen.getByRole('button', { name: 'Stop and save track' }))

    // stop() awaits a fake-IndexedDB write before its state update lands —
    // userEvent's click only flushes React's own microtasks, not the
    // IndexedDB transaction-complete callback, so the final store update
    // (and the setTrackPreview(null) it triggers) can lag behind the click.
    await vi.waitFor(() => {
      expect(setTrackPreview).toHaveBeenLastCalledWith(null)
    })
    expect(screen.getByRole('button', { name: 'Record a GPS track' })).toBeInTheDocument()
  })

  it('shows an offline badge when navigator.onLine is false, not when online', () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false })
    const { unmount } = render(<MapPage />)
    expect(screen.getByText('Offline — showing cached maps')).toBeInTheDocument()
    unmount()

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    render(<MapPage />)
    expect(screen.queryByText('Offline — showing cached maps')).not.toBeInTheDocument()
  })

  it('selects the current viewport as an offline area, shows a real tile count, and downloads it', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Download this area for offline use' }))
    expect(getBounds).toHaveBeenCalled()
    // Real tile-math count for this bbox/zoom-range, not a placeholder.
    expect(screen.getByText(/\d+ tiles? \(zoom/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Start download' }))

    expect(downloadArea).toHaveBeenCalledOnce()
    await vi.waitFor(() => {
      expect(useOfflineStore.getState().areas.at(-1)?.status).toBe('complete')
    })
    const [persisted] = await db.offlineAreas.toArray()
    expect(persisted.tilesDownloaded).toBe(4)
  })

  it('toggling the wind layer fetches a real field and animates it on the map; toggling off clears it', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Toggle wind flow field' }))

    expect(fetchWindField).toHaveBeenCalledWith(
      { west: -71.3, south: 46.7, east: -71.1, north: 46.9 },
      5,
    )
    await vi.waitFor(() => {
      expect(setWindField).toHaveBeenLastCalledWith(
        expect.objectContaining({ timezone: 'America/Toronto' }),
        0,
        'wind',
      )
    })
    expect(await screen.findByRole('img', { name: 'Wind compass' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toggle wind flow field' }))
    expect(setWindField).toHaveBeenLastCalledWith(null, 0, 'wind')
  })

  it('switching the weather map layer re-renders instantly with no re-fetch, since every layer rides the same fetched grid', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Toggle wind flow field' }))
    await vi.waitFor(() => {
      expect(setWindField).toHaveBeenLastCalledWith(expect.anything(), 0, 'wind')
    })
    fetchWindField.mockClear()

    await user.click(screen.getByRole('tab', { name: 'Temperature' }))

    expect(fetchWindField).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      expect(setWindField).toHaveBeenLastCalledWith(expect.anything(), 0, 'temperature')
    })
  })

  it('shows a recent-spots comparison strip after analyzing 2+ points, and recalls a cached one with no re-fetch', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Analyze this spot' }))
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8139, lng: -71.208 })
    await screen.findByRole('heading', { name: 'Spot analysis' })
    await vi.waitFor(() => expect(fetchForecast).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Analyze this spot' }))
    lastCreateMapOptions?.onMapClick?.({ lat: 46.82, lng: -71.21 })
    await vi.waitFor(() => expect(fetchForecast).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => {
      expect(screen.getByRole('group', { name: 'Recently analyzed spots' })).toBeInTheDocument()
    })

    const strip = screen.getByRole('group', { name: 'Recently analyzed spots' })
    const chips = within(strip).getAllByRole('button')
    expect(chips).toHaveLength(2)

    fetchForecast.mockClear()
    await user.click(chips[1]) // recall the first-analyzed spot from cache

    expect(fetchForecast).not.toHaveBeenCalled()
  })

  it('arms the spot analysis tool, runs every analyzer for the tapped point, and shows an explainable breakdown', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Analyze this spot' }))
    expect(screen.getByText('Tap the map to analyze that spot')).toBeInTheDocument()

    lastCreateMapOptions?.onMapClick?.({ lat: 46.8139, lng: -71.208 })

    expect(await screen.findByRole('heading', { name: 'Spot analysis' })).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(fetchForecast).toHaveBeenCalledWith({ lat: 46.8139, lng: -71.208 })
      expect(fetchVegetation).toHaveBeenCalledWith({ lat: 46.8139, lng: -71.208 }, 300)
    })

    // A real combined score + all 6 analyzers, not a fabricated summary.
    expect(await screen.findByText(/\/100 —/)).toBeInTheDocument()
    const panel = within(screen.getByTestId('spot-analysis-panel'))
    for (const label of ['Terrain', 'Vegetation', 'Weather', 'Wind', 'Time', 'History']) {
      expect(panel.getByText(label)).toBeInTheDocument()
    }

    await user.click(panel.getByText('Terrain'))
    expect(panel.getByText(/slope/i)).toBeInTheDocument()
  })

  it('toggles the analysis heatmap, computing a real 5x5 grid from one batched fetch each', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Toggle analysis heatmap' }))

    await vi.waitFor(() => {
      expect(setAnalysisHeatmap).toHaveBeenLastCalledWith(
        expect.arrayContaining([expect.objectContaining({ coordinate: expect.anything() })]),
      )
    })
    const [cells] = setAnalysisHeatmap.mock.calls[setAnalysisHeatmap.mock.calls.length - 1]
    expect(cells).toHaveLength(25)
    expect(fetchWindField).toHaveBeenCalledWith(
      { west: -71.3, south: 46.7, east: -71.1, north: 46.9 },
      5,
    )
    expect(fetchVegetationGrid).toHaveBeenCalledWith(
      { west: -71.3, south: 46.7, east: -71.1, north: 46.9 },
      5,
    )
    expect(screen.getByText(/probabilistic read/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toggle analysis heatmap' }))
    expect(setAnalysisHeatmap).toHaveBeenLastCalledWith(null)
  })

  it('re-projects the heatmap to a single analyzer score when the view is switched, with no re-fetch', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Toggle analysis heatmap' }))
    await vi.waitFor(() => {
      expect(setAnalysisHeatmap).toHaveBeenCalled()
    })
    fetchWindField.mockClear()
    fetchForecast.mockClear()
    fetchVegetationGrid.mockClear()

    await user.selectOptions(screen.getByLabelText('Score shown'), 'wind')

    expect(fetchWindField).not.toHaveBeenCalled()
    expect(fetchForecast).not.toHaveBeenCalled()
    expect(fetchVegetationGrid).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      const [cells] = setAnalysisHeatmap.mock.calls[setAnalysisHeatmap.mock.calls.length - 1]
      expect(cells[0].combined.overallScore).toBe(
        cells[0].combined.results.find((r: { analyzer: string }) => r.analyzer === 'wind').score,
      )
    })
  })

  it('Field Mode hides the advanced tools, shows a real compass, and turns off an active wind/heatmap layer', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    render(<MapPage />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Toggle wind flow field' }))
    expect(screen.getByRole('button', { name: 'Toggle wind flow field' })).toBeInTheDocument()

    useFieldModeStore.setState({ enabled: true, loaded: true })

    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Toggle wind flow field' })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Toggle analysis heatmap' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Analyze this spot' })).not.toBeInTheDocument()
    // Real CompassDisplay is now shown instead — jsdom has no orientation
    // API, so it honestly reports unavailable rather than a fake heading.
    expect(screen.getByText(/not supported/)).toBeInTheDocument()
    expect(useWindStore.getState().enabled).toBe(false)

    vi.unstubAllGlobals()
  })
})
