import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapPage } from './MapPage'
import { useLayersStore } from '@/features/layers/state/layersStore'
import { useMapStore } from '../state/mapStore'
import { useFollowStore } from '../state/followStore'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useTerrainToolsStore } from '../state/terrainToolsStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { useAnalysisStore } from '@/features/analytics/state/analysisStore'
import { useHeatmapStore } from '@/features/analytics/state/heatmapStore'
import { useWeatherMapStore } from '@/features/weather-map/state/weatherMapStore'
import { useFieldModeStore } from '@/features/field-mode/state/fieldModeStore'
import { db } from '@/database/db'
import { useSharedPointStore } from '@/features/share/sharedPointStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { CreateMapOptions } from '@/services/map'
import { progressFixture } from '@/test/downloadFixtures'

// jsdom has no WebGL context, so MapLibre GL JS cannot run in tests — the
// point of the MapProvider adapter is that feature code (and its tests)
// never need to know that; we mock the adapter, not the map engine.
const destroy = vi.fn()
const setBaseLayer = vi.fn()
const setOverlayVisible = vi.fn()
const setView = vi.fn()
const setUserLocationMarker = vi.fn()
const setWaypoints = vi.fn()
const setDraftWaypoint = vi.fn()
const setSelectedWaypoint = vi.fn()
const setSharedPoint = vi.fn()
const setTrackPreview = vi.fn()
const setMeasurePath = vi.fn()
const setGuidanceLine = vi.fn()
const setUserHeading = vi.fn()
const setWindField = vi.fn()
const setAnalysisHeatmap = vi.fn()
const setRasterOverlay = vi.fn()
const setWeatherFrames = vi.fn()
const isWeatherFrameReady = vi.fn(() => true)
const setTerrainEnabled = vi.fn()
const queryElevation = vi.fn(() => null as number | null)
const resize = vi.fn()
const getBounds = vi.fn(() => ({ west: -71.3, south: 46.7, east: -71.1, north: 46.9 }))
const downloadArea = vi.fn().mockResolvedValue(progressFixture())
let lastCreateMapOptions: CreateMapOptions | undefined
const createMap = vi.fn((options: CreateMapOptions) => {
  lastCreateMapOptions = options
  return {
    setView,
    setBaseLayer,
    setOverlayVisible,
    setUserLocationMarker,
    setWaypoints,
    setDraftWaypoint,
    setSelectedWaypoint,
    setSharedPoint,
    setTrackPreview,
    setMeasurePath,
    setGuidanceLine,
    setUserHeading,
    setWindField,
    setAnalysisHeatmap,
    setRasterOverlay,
    setWeatherFrames,
    isWeatherFrameReady,
    setTerrainEnabled,
    queryElevation,
    getBounds,
    resize,
    downloadArea,
    destroy,
  }
})

let mockProvider: { createMap: typeof createMap } | null = { createMap }

const ALL_BASE_LAYERS = [
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
]
let mockAvailableBaseLayers: string[] = ALL_BASE_LAYERS
vi.mock('@/services/map', () => ({
  get mapProvider() {
    return mockProvider
  },
  get availableBaseLayers() {
    return mockAvailableBaseLayers
  },
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
const fetchFrames = vi.fn().mockResolvedValue([
  { time: '2026-09-25T14:48:00Z', kind: 'observed' },
  { time: '2026-09-25T15:00:00Z', kind: 'observed' },
])
const fetchValueAt = vi.fn().mockResolvedValue(null)
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

/** Time of the simulated fixes (kept recent so the badge says "GPS ±N m"). */
const FIX_TIME_MS = Date.now()

let mockGpsReading: GeolocationReading = {
  status: 'unavailable',
  kind: 'unavailable',
  reason: 'Geolocation is not supported by this browser.',
}

vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => mockGpsReading,
}))

afterEach(async () => {
  // Unmount first: resetting the stores below must not re-render a live map page.
  cleanup()
  vi.clearAllMocks()
  mockProvider = { createMap }
  mockAvailableBaseLayers = ALL_BASE_LAYERS
  mockGpsReading = {
    status: 'unavailable',
    kind: 'unavailable',
    reason: 'Geolocation is not supported by this browser.',
  }
  useSharedPointStore.setState({ point: null, notice: null })
  useFollowStore.setState({ mode: 'off' })
  useGuidanceStore.setState({ destinationId: null, collapsed: false, notice: null })
  useLayersStore.setState({
    baseLayer: 'outdoor',
    baseLayerChosenByUser: false,
    baseLayerNotice: null,
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
  useAnalysisStore.setState({
    mode: 'idle',
    status: 'idle',
    coordinate: null,
    combined: null,
    errorReason: null,
    recent: [],
  })
  useHeatmapStore.setState({
    status: 'idle',
    enabled: false,
    cells: [],
    errorReason: null,
    selectedView: 'combined',
  })
  useWeatherMapStore.setState({
    enabled: false,
    activeLayer: 'radar',
    status: 'idle',
    frames: [],
    frameIndex: 0,
    playing: false,
    cache: {},
  })
  useFieldModeStore.setState({ enabled: false, loaded: true })
  useWaypointsStore.setState({
    waypoints: [],
    loaded: false,
    isPlacing: false,
    draft: null,
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

/** Opens the "Outils" bottom sheet. */
async function openTools(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Outils' }))
}

/** Opens the "Outils" sheet and taps one of its tools (the sheet then closes). */
async function useTool(user: ReturnType<typeof userEvent.setup>, name: string) {
  await openTools(user)
  await user.click(screen.getByRole('button', { name }))
}

/** Opens the (collapsed by default) "Couches" panel. */
async function openLayers(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Couches' }))
}

describe('MapPage', () => {
  it('mounts the map via the provider adapter and tears it down on unmount', () => {
    const { unmount } = render(<MapPage />)

    expect(screen.getByTestId('map-container')).toBeInTheDocument()
    expect(createMap).toHaveBeenCalledOnce()
    expect(createMap).toHaveBeenCalledWith(
      expect.objectContaining({ initialBaseLayer: 'esri-imagery' }),
    )

    unmount()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('opens on the hybrid satellite view and does not swap the style afterwards', () => {
    render(<MapPage />)

    expect(useLayersStore.getState().baseLayer).toBe('esri-imagery')
    expect(setBaseLayer).not.toHaveBeenCalled()
  })

  it('keeps the layer the user picked earlier in the session', () => {
    useLayersStore.setState({ baseLayer: 'outdoor', baseLayerChosenByUser: true })
    render(<MapPage />)

    expect(createMap).toHaveBeenCalledWith(
      expect.objectContaining({ initialBaseLayer: 'outdoor' }),
    )
  })

  it('keeps the chosen layer across a leave-and-return of the map page', () => {
    const first = render(<MapPage />)
    expect(createMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialBaseLayer: 'esri-imagery' }),
    )
    act(() => useLayersStore.getState().setBaseLayer('satellite'))
    first.unmount()

    render(<MapPage />)
    expect(createMap).toHaveBeenLastCalledWith(
      expect.objectContaining({ initialBaseLayer: 'satellite' }),
    )
  })

  it('opens on the hybrid view again on a cold launch (fresh session state)', () => {
    useLayersStore.setState({ baseLayer: 'satellite', baseLayerChosenByUser: true })
    // A cold launch re-creates the stores: nothing carries the choice over.
    useLayersStore.setState({ baseLayer: 'outdoor', baseLayerChosenByUser: false })
    render(<MapPage />)
    expect(createMap).toHaveBeenCalledWith(
      expect.objectContaining({ initialBaseLayer: 'esri-imagery' }),
    )
  })

  it('says explicitly when the hybrid view is unavailable because the Esri key is missing', () => {
    mockAvailableBaseLayers = ['outdoor', 'satellite']
    render(<MapPage />)

    expect(createMap).toHaveBeenCalledWith(
      expect.objectContaining({ initialBaseLayer: 'satellite' }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Imagerie hybride indisponible (la clé Esri n’est pas configurée) : fond « Satellite » affiché.',
    )
  })

  it('shows no fallback notice when the hybrid view is used', () => {
    render(<MapPage />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('falls back to Satellite, with a visible message, when the hybrid style fails to load', () => {
    render(<MapPage />)
    act(() => lastCreateMapOptions?.onBaseLayerError?.('esri-imagery', 'HTTP 403'))

    expect(useLayersStore.getState().baseLayer).toBe('satellite')
    expect(useLayersStore.getState().baseLayerChosenByUser).toBe(false)
    expect(setBaseLayer).toHaveBeenCalledWith('satellite')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Fond « Imagerie hybride » indisponible',
    )
    expect(screen.getByRole('status')).toHaveTextContent('repli sur « Satellite »')
  })

  it('reports that nothing else can be loaded when every fallback failed', () => {
    mockAvailableBaseLayers = ['esri-imagery', 'satellite']
    render(<MapPage />)
    act(() => lastCreateMapOptions?.onBaseLayerError?.('esri-imagery', 'réseau'))
    act(() => lastCreateMapOptions?.onBaseLayerError?.('satellite', 'réseau'))

    expect(screen.getByRole('status')).toHaveTextContent('Aucun autre fond')
  })

  it('never overrides a layer the user picked when it fails: it only explains', () => {
    useLayersStore.setState({ baseLayer: 'outdoor', baseLayerChosenByUser: true })
    render(<MapPage />)
    act(() => lastCreateMapOptions?.onBaseLayerError?.('outdoor', 'réseau'))

    expect(useLayersStore.getState().baseLayer).toBe('outdoor')
    expect(setBaseLayer).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Fond « Extérieur » indisponible',
    )
  })

  it('shows an explicit unavailable state when no provider is configured', () => {
    mockProvider = null
    render(<MapPage />)

    expect(screen.getByText('Carte indisponible')).toBeInTheDocument()
    expect(createMap).not.toHaveBeenCalled()
  })

  it('switches the base layer via the layer manager panel without recreating the map', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await openLayers(user)

    await user.click(screen.getByRole('radio', { name: 'Satellite' }))

    expect(setBaseLayer).toHaveBeenCalledOnce()
    expect(setBaseLayer).toHaveBeenCalledWith('satellite')
    expect(createMap).toHaveBeenCalledOnce()
  })

  it('shows an unavailable GPS badge and a disabled locate button with no fix', () => {
    render(<MapPage />)

    expect(screen.getByText('GPS indisponible')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Me localiser' })).toBeDisabled()
  })

  it('shows the accuracy badge, marks the map and recenters on a real GPS fix', async () => {
    mockGpsReading = {
      status: 'available',
      value: { lat: 46.8, lng: -71.2, accuracyMeters: 12, timestampMs: FIX_TIME_MS },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    const user = userEvent.setup()
    render(<MapPage />)

    expect(screen.getByText('GPS ±12 m')).toBeInTheDocument()
    expect(setUserLocationMarker).toHaveBeenCalledWith({
      lat: 46.8,
      lng: -71.2,
      accuracyMeters: 12,
      timestampMs: FIX_TIME_MS,
    })

    const locateButton = screen.getByRole('button', { name: 'Me localiser' })
    expect(locateButton).toBeEnabled()

    await user.click(locateButton)
    // Recenter also zooms in to a useful field scale (never out) — the
    // fixture's default viewport zoom (6) is well below that floor.
    expect(setView).toHaveBeenCalledWith({ center: { lat: 46.8, lng: -71.2 }, zoom: 16 })
  })

  it('toggles an overlay via the layer manager panel', async () => {
    const user = userEvent.setup()
    useLayersStore.setState({ baseLayer: 'outdoor', baseLayerChosenByUser: true })
    render(<MapPage />)
    await openLayers(user)

    const contoursToggle = screen.getByRole('checkbox', { name: 'Courbes de niveau' })
    expect(contoursToggle).toBeEnabled()

    await user.click(contoursToggle)

    expect(setOverlayVisible).toHaveBeenCalledOnce()
    expect(setOverlayVisible).toHaveBeenCalledWith('contours', false)
  })

  it('disables overlay toggles while the Satellite base layer is active', async () => {
    const user = userEvent.setup()
    useLayersStore.setState({ baseLayer: 'satellite', baseLayerChosenByUser: true })
    render(<MapPage />)
    await openLayers(user)

    expect(screen.getByRole('checkbox', { name: 'Courbes de niveau' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Sentiers' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Hydrographie' })).toBeDisabled()
  })

  it('switches to the 3D camera preset and back without recreating the map', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await openTools(user)

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
    await openTools(user)

    await user.click(screen.getByRole('button', { name: '3D' }))
    expect(setTerrainEnabled).toHaveBeenLastCalledWith(true, 2)

    await user.click(screen.getByRole('button', { name: '2D' }))
    expect(setTerrainEnabled).toHaveBeenLastCalledWith(false, 2)
  })

  it('the exaggeration stepper only appears in 3D, and updates the engine live', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await openTools(user)

    expect(
      screen.queryByLabelText("Augmenter l'exagération du relief"),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '3D' }))
    await user.click(
      screen.getByRole('button', { name: "Augmenter l'exagération du relief" }),
    )

    expect(setTerrainEnabled).toHaveBeenLastCalledWith(true, 3)
    expect(screen.getByText('3×')).toBeInTheDocument()
  })

  it('queries elevation/slope/aspect at a tapped point via the terrain info tool', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(312)
    render(<MapPage />)

    await useTool(user, 'Altitude, pente et exposition')
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })

    expect(await screen.findByText('312 m')).toBeInTheDocument()
    expect(queryElevation).toHaveBeenCalledWith({ lat: 46.8, lng: -71.2 })
  })

  it('draws an elevation profile from tapped points and shows the chart panel', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await useTool(user, "Profil d'élévation")
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })
    lastCreateMapOptions?.onMapClick?.({ lat: 46.81, lng: -71.2 })

    await user.click(screen.getByRole('button', { name: 'Terminer' }))

    expect(await screen.findByText('Profil d’élévation')).toBeInTheDocument()
  })

  it('shows each tapped elevation-profile point on the map immediately, and clears them on discard', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await useTool(user, "Profil d'élévation")
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

    await user.click(screen.getByRole('button', { name: 'Terminer' }))
    await user.click(screen.getByRole('button', { name: 'Abandonner' }))

    expect(setMeasurePath).toHaveBeenLastCalledWith(null)
  })

  /** Arms placing, taps the map at `coordinate`, and opens the details form. */
  async function placeDraft(
    user: ReturnType<typeof userEvent.setup>,
    coordinate = { lat: 46.8, lng: -71.2 },
  ) {
    await user.click(screen.getByRole('button', { name: 'Ajouter un point de repère' }))
    lastCreateMapOptions?.onMapClick?.(coordinate)
    await user.click(await screen.findByRole('button', { name: 'Continuer' }))
  }

  it('placing a waypoint only opens an adjustable draft: nothing is saved before "Enregistrer"', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Ajouter un point de repère' }))
    expect(
      screen.getByText('Touchez la carte pour placer un point de repère'),
    ).toBeInTheDocument()

    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })

    expect(await screen.findByText('Nouveau point de repère')).toBeInTheDocument()
    expect(
      screen.queryByText('Touchez la carte pour placer un point de repère'),
    ).not.toBeInTheDocument()
    expect(setDraftWaypoint).toHaveBeenLastCalledWith({ lat: 46.8, lng: -71.2 })
    expect(await db.waypoints.count()).toBe(0)
    expect(setWaypoints).not.toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ coordinate: { lat: 46.8, lng: -71.2 } }),
      ]),
    )
  })

  it('the draft position can be adjusted by tapping the map or dragging its marker, then Save locks it', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Ajouter un point de repère' }))
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8, lng: -71.2 })
    await screen.findByText('Nouveau point de repère')

    lastCreateMapOptions?.onMapClick?.({ lat: 46.81, lng: -71.21 }) // tap to adjust
    await vi.waitFor(() =>
      expect(setDraftWaypoint).toHaveBeenLastCalledWith({ lat: 46.81, lng: -71.21 }),
    )
    lastCreateMapOptions?.onDraftMove?.({ lat: 46.82, lng: -71.22 }) // drag the dashed marker
    await vi.waitFor(() =>
      expect(setDraftWaypoint).toHaveBeenLastCalledWith({ lat: 46.82, lng: -71.22 }),
    )

    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(async () => {
      const [saved] = await db.waypoints.toArray()
      expect(saved.coordinate).toEqual({ lat: 46.82, lng: -71.22 })
    })
    expect(setWaypoints).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ coordinate: { lat: 46.82, lng: -71.22 } }),
      ]),
    )
    expect(setDraftWaypoint).toHaveBeenLastCalledWith(null)
  })

  it('cancelling a creation leaves no waypoint and no draft marker', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await placeDraft(user)

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByText('Nouveau point de repère')).not.toBeInTheDocument()
    expect(setDraftWaypoint).toHaveBeenLastCalledWith(null)
    expect(await db.waypoints.count()).toBe(0)
  })

  it('a failed save keeps the form open with the error visible and nothing half-saved', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await placeDraft(user)
    const add = vi
      .spyOn(db.waypoints, 'add')
      .mockRejectedValueOnce(new Error('disque plein'))

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('disque plein')
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    expect(await db.waypoints.count()).toBe(0)

    add.mockRestore()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
  })

  it('opens a saved waypoint with its location shown read-only, and deletes it only after confirmation', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await placeDraft(user)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [waypoint] = await db.waypoints.toArray()

    lastCreateMapOptions?.onWaypointClick?.(waypoint.id)
    expect(
      await screen.findByRole('heading', { name: 'Point de repère' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Position verrouillée/)).toBeInTheDocument()
    // No field to type coordinates, and no "move" control.
    expect(screen.queryByLabelText(/latitude|longitude/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /déplacer|déverrouiller/i }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('irréversible')
    expect(await db.waypoints.count()).toBe(1)

    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }),
    )
    await vi.waitFor(async () => expect(await db.waypoints.toArray()).toEqual([]))
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Point de repère' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('highlights on the map the waypoint whose sheet is open, and clears it on close', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await placeDraft(user)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [waypoint] = await db.waypoints.toArray()
    expect(setSelectedWaypoint).toHaveBeenLastCalledWith(null)

    lastCreateMapOptions?.onWaypointClick?.(waypoint.id)
    await screen.findByRole('heading', { name: 'Point de repère' })
    expect(setSelectedWaypoint).toHaveBeenLastCalledWith(waypoint.id)

    await user.click(screen.getByRole('button', { name: 'Fermer sans enregistrer' }))
    expect(setSelectedWaypoint).toHaveBeenLastCalledWith(null)
  })

  it('shows the saved waypoint big coordinates in the sheet, plus the separate "Ma position" block', async () => {
    mockGpsReading = {
      status: 'unavailable',
      kind: 'denied',
      reason: 'Autorisation de localisation refusée.',
    }
    const user = userEvent.setup()
    render(<MapPage />)
    await placeDraft(user, { lat: 46.8, lng: -71.2 })
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [waypoint] = await db.waypoints.toArray()

    lastCreateMapOptions?.onWaypointClick?.(waypoint.id)
    await screen.findByRole('heading', { name: 'Point de repère' })

    expect(screen.getByTestId('waypoint-latitude')).toHaveTextContent('46,80000° N')
    expect(screen.getByTestId('waypoint-longitude')).toHaveTextContent('71,20000° O')
    const mine = screen.getByTestId('my-position')
    expect(within(mine).getByTestId('gps-state')).toHaveTextContent('Refusé')
    // No GPS fix: the map centre is never substituted.
    expect(within(mine).queryByText(/°/)).not.toBeInTheDocument()
  })

  it('previews a shared point as a distinct marker, writes nothing, and saves only on request', async () => {
    useSharedPointStore.setState({
      point: { coordinate: { lat: 46.8139, lng: -71.208 }, name: 'Mirador' },
    })
    const user = userEvent.setup()
    render(<MapPage />)

    expect(setSharedPoint).toHaveBeenLastCalledWith(
      { lat: 46.8139, lng: -71.208 },
      'Mirador',
    )
    expect(setView).toHaveBeenCalledWith(
      expect.objectContaining({ center: { lat: 46.8139, lng: -71.208 } }),
    )
    expect(screen.getByText('Point partagé : Mirador')).toBeInTheDocument()
    expect(await db.waypoints.count()).toBe(0)

    await user.click(
      screen.getByRole('button', { name: 'Enregistrer comme point de repère' }),
    )
    // Only the usual new-waypoint draft opens; the preview is gone; still nothing saved.
    expect(
      screen.getByRole('region', { name: 'Position du nouveau point de repère' }),
    ).toBeInTheDocument()
    expect(setSharedPoint).toHaveBeenLastCalledWith(null, '')
    expect(await db.waypoints.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Continuer' }))
    expect(screen.getByLabelText('Nom')).toHaveValue('Mirador')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [saved] = await db.waypoints.toArray()
    expect(saved).toMatchObject({
      name: 'Mirador',
      coordinate: { lat: 46.8139, lng: -71.208 },
    })
  })

  it('Ignorer removes the shared-point preview from the map', async () => {
    useSharedPointStore.setState({
      point: { coordinate: { lat: 1, lng: 2 }, name: 'X' },
    })
    const user = userEvent.setup()
    render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Ignorer' }))
    expect(setSharedPoint).toHaveBeenLastCalledWith(null, '')
    expect(screen.queryByText('Point partagé : X')).not.toBeInTheDocument()
  })

  it.each([
    ['searching', 'GPS : recherche…'],
    ['denied', 'GPS refusé'],
    ['timeout', 'GPS indisponible'],
  ] as const)('shows the %s GPS state in the badge, with no position', (kind, text) => {
    mockGpsReading = { status: 'unavailable', kind, reason: 'raison' }
    render(<MapPage />)
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(setUserLocationMarker).toHaveBeenLastCalledWith(null)
  })

  it('flags an old GPS fix in the badge', () => {
    mockGpsReading = {
      status: 'available',
      value: {
        lat: 46.8,
        lng: -71.2,
        accuracyMeters: 9,
        timestampMs: Date.now() - 60_000,
      },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    render(<MapPage />)
    expect(screen.getByText('GPS ancien ±9 m')).toBeInTheDocument()
  })

  it('a saved waypoint cannot be moved: no drag callback, map taps and GPS updates leave it in place', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<MapPage />)
    expect(lastCreateMapOptions).not.toHaveProperty('onWaypointDragEnd')

    await placeDraft(user, { lat: 46.8, lng: -71.2 })
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [waypoint] = await db.waypoints.toArray()

    // Edit panel open on the saved waypoint, then taps on the map.
    lastCreateMapOptions?.onWaypointClick?.(waypoint.id)
    await screen.findByRole('heading', { name: 'Point de repère' })
    lastCreateMapOptions?.onMapClick?.({ lat: 47.5, lng: -72.5 })
    lastCreateMapOptions?.onDraftMove?.({ lat: 47.6, lng: -72.6 })

    // A new GPS position arrives.
    mockGpsReading = {
      status: 'available',
      value: { lat: 46.9, lng: -71.3, accuracyMeters: 5, timestampMs: FIX_TIME_MS },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    rerender(<MapPage />)

    const [after] = await db.waypoints.toArray()
    expect(after.coordinate).toEqual({ lat: 46.8, lng: -71.2 })
    expect(setDraftWaypoint).toHaveBeenLastCalledWith(null)
  })

  it('saves per-waypoint optimal wind octants and flags whether the live wind matches', async () => {
    const user = userEvent.setup()
    render(<MapPage />)
    await placeDraft(user, { lat: 46.8139, lng: -71.208 })
    expect(
      await screen.findByRole('heading', { name: 'Nouveau point de repère' }),
    ).toBeInTheDocument()

    // Turn the wind layer on so the live reading (mocked to blow from
    // 270°/W) is available for the "matches now" badge.
    await user.click(screen.getByRole('button', { name: 'Météo et radar' }))
    await user.click(screen.getByRole('button', { name: 'Particules de vent' }))
    await vi.waitFor(() => {
      expect(
        screen.getAllByRole('img', { name: 'Boussole du vent' }).length,
      ).toBeGreaterThan(0)
    })

    // Mark north as optimal — the live wind (W) should read as a mismatch.
    await user.click(screen.getByRole('button', { name: 'N' }))
    expect(await screen.findByText('O maintenant')).toHaveClass('text-status-danger')

    // Mark west too — now the live wind matches.
    await user.click(screen.getByRole('button', { name: 'O' }))
    expect(await screen.findByText('O maintenant')).toHaveClass('text-status-success')

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(async () => {
      const [waypoint] = await db.waypoints.toArray()
      expect(waypoint.optimalWindDirections).toEqual(expect.arrayContaining([0, 270]))
    })
  })

  it('starts a GPS track recording and mirrors the live preview onto the map', async () => {
    const user = userEvent.setup()
    mockGpsReading = {
      status: 'available',
      value: { lat: 46.8, lng: -71.2, accuracyMeters: 5, timestampMs: FIX_TIME_MS },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    render(<MapPage />)

    await useTool(user, 'Enregistrer une trace GPS')
    expect(screen.getByText('● Enregistrement')).toBeInTheDocument()

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

    await useTool(user, 'Enregistrer une trace GPS')
    await user.click(
      screen.getByRole('button', { name: 'Arrêter et enregistrer la trace' }),
    )

    // stop() awaits a fake-IndexedDB write before its state update lands —
    // userEvent's click only flushes React's own microtasks, not the
    // IndexedDB transaction-complete callback, so the final store update
    // (and the setTrackPreview(null) it triggers) can lag behind the click.
    await vi.waitFor(() => {
      expect(setTrackPreview).toHaveBeenLastCalledWith(null)
    })
    await openTools(user)
    expect(
      screen.getByRole('button', { name: 'Enregistrer une trace GPS' }),
    ).toBeInTheDocument()
  })

  it('shows an offline badge when navigator.onLine is false, not when online', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    const { unmount } = render(<MapPage />)
    expect(screen.getByText('Hors ligne — cartes en cache')).toBeInTheDocument()
    unmount()

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
    render(<MapPage />)
    expect(screen.queryByText('Hors ligne — cartes en cache')).not.toBeInTheDocument()
  })

  it('selects the current viewport as an offline area, shows a real tile count, and downloads it', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await useTool(user, 'Télécharger cette zone hors ligne')
    expect(getBounds).toHaveBeenCalled()
    // Real tile-math count for this bbox/zoom-range, not a placeholder.
    expect(screen.getByText(/\d+ tuiles? \(zoom/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lancer le téléchargement' }))

    await vi.waitFor(() => expect(downloadArea).toHaveBeenCalledOnce())
    await vi.waitFor(() => {
      expect(useOfflineStore.getState().areas.at(-1)?.status).toBe('complete')
    })
    const [persisted] = await db.offlineAreas.toArray()
    expect(persisted.tilesDownloaded).toBe(4)
  })

  it('toggling wind particles (inside the weather map) fetches a real field and animates it; toggling off clears it', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Météo et radar' }))
    await user.click(screen.getByRole('button', { name: 'Particules de vent' }))

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
    expect(
      await screen.findByRole('img', { name: 'Boussole du vent' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Particules de vent' }))
    expect(setWindField).toHaveBeenLastCalledWith(null, 0, 'wind')
  })

  it('the weather map shows real GeoMet radar frames on the map, latest first, and switches layers', async () => {
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Météo et radar' }))

    await vi.waitFor(() => {
      expect(setWeatherFrames).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({ key: 'radar-2026-09-25T14:48:00Z' }),
          expect.objectContaining({
            key: 'radar-2026-09-25T15:00:00Z',
            tileUrlTemplates: [
              expect.stringContaining('RADAR_1KM_RRAI'),
              expect.stringContaining('RADAR_1KM_RSNO'),
            ],
          }),
        ],
        1,
        0.75,
      )
    })
    expect(screen.getByRole('slider', { name: 'Ligne du temps' })).toBeInTheDocument()

    fetchFrames.mockResolvedValueOnce([
      { time: '2026-09-25T15:00:00Z', kind: 'forecast' },
    ])
    await user.click(screen.getByRole('radio', { name: 'Temp.' }))
    await vi.waitFor(() => {
      expect(setWeatherFrames).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            tileUrlTemplates: [expect.stringContaining('HRDPS.CONTINENTAL_TT')],
          }),
        ],
        0,
        0.75,
      )
    })

    await user.click(screen.getByRole('button', { name: 'Fermer la carte météo' }))
    expect(setWeatherFrames).toHaveBeenLastCalledWith(null, 0, 0.75)
  })

  it('shows a recent-spots comparison strip after analyzing 2+ points, and recalls a cached one with no re-fetch', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await useTool(user, 'Analyser cet endroit')
    lastCreateMapOptions?.onMapClick?.({ lat: 46.8139, lng: -71.208 })
    await screen.findByRole('heading', { name: 'Analyse de l’endroit' })
    await vi.waitFor(() => expect(fetchForecast).toHaveBeenCalledTimes(1))

    await useTool(user, 'Analyser cet endroit')
    lastCreateMapOptions?.onMapClick?.({ lat: 46.82, lng: -71.21 })
    await vi.waitFor(() => expect(fetchForecast).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => {
      expect(
        screen.getByRole('group', { name: 'Endroits analysés récemment' }),
      ).toBeInTheDocument()
    })

    const strip = screen.getByRole('group', { name: 'Endroits analysés récemment' })
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

    await useTool(user, 'Analyser cet endroit')
    expect(
      screen.getByText('Touchez la carte pour analyser cet endroit'),
    ).toBeInTheDocument()

    lastCreateMapOptions?.onMapClick?.({ lat: 46.8139, lng: -71.208 })

    expect(
      await screen.findByRole('heading', { name: 'Analyse de l’endroit' }),
    ).toBeInTheDocument()
    await vi.waitFor(() => {
      expect(fetchForecast).toHaveBeenCalledWith({ lat: 46.8139, lng: -71.208 })
      expect(fetchVegetation).toHaveBeenCalledWith({ lat: 46.8139, lng: -71.208 }, 300)
    })

    // A real combined score + all 6 analyzers, not a fabricated summary.
    expect(await screen.findByText(/\/100 —/)).toBeInTheDocument()
    const panel = within(screen.getByTestId('spot-analysis-panel'))
    for (const label of [
      'Terrain',
      'Végétation',
      'Météo',
      'Vent',
      'Moment',
      'Historique',
    ]) {
      expect(panel.getByText(label)).toBeInTheDocument()
    }

    await user.click(panel.getByText('Terrain'))
    expect(panel.getByText(/pente/i)).toBeInTheDocument()
  })

  it('toggles the analysis heatmap, computing a real 8x8 grid from one batched fetch each', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await useTool(user, 'Carte de potentiel')

    await vi.waitFor(() => {
      expect(setAnalysisHeatmap).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ coordinate: expect.anything() }),
        ]),
      )
    })
    const [cells] =
      setAnalysisHeatmap.mock.calls[setAnalysisHeatmap.mock.calls.length - 1]
    expect(cells).toHaveLength(64)
    expect(fetchWindField).toHaveBeenCalledWith(
      { west: -71.3, south: 46.7, east: -71.1, north: 46.9 },
      8,
    )
    expect(fetchVegetationGrid).toHaveBeenCalledWith(
      { west: -71.3, south: 46.7, east: -71.1, north: 46.9 },
      8,
    )
    expect(screen.getByText(/Lecture probabiliste/)).toBeInTheDocument()

    await useTool(user, 'Carte de potentiel')
    expect(setAnalysisHeatmap).toHaveBeenLastCalledWith(null)
  })

  it('re-projects the heatmap to a single analyzer score when the view is switched, with no re-fetch', async () => {
    const user = userEvent.setup()
    queryElevation.mockReturnValue(300)
    render(<MapPage />)

    await useTool(user, 'Carte de potentiel')
    await vi.waitFor(() => {
      expect(setAnalysisHeatmap).toHaveBeenCalled()
    })
    fetchWindField.mockClear()
    fetchForecast.mockClear()
    fetchVegetationGrid.mockClear()

    await user.selectOptions(screen.getByLabelText('Score affiché'), 'wind')

    expect(fetchWindField).not.toHaveBeenCalled()
    expect(fetchForecast).not.toHaveBeenCalled()
    expect(fetchVegetationGrid).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      const [cells] =
        setAnalysisHeatmap.mock.calls[setAnalysisHeatmap.mock.calls.length - 1]
      expect(cells[0].combined.overallScore).toBe(
        cells[0].combined.results.find((r: { analyzer: string }) => r.analyzer === 'wind')
          .score,
      )
    })
  })

  it('Field Mode hides the advanced tools, shows a real compass, and turns off an active wind/heatmap layer', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined)
    render(<MapPage />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Météo et radar' }))
    await user.click(screen.getByRole('button', { name: 'Particules de vent' }))
    expect(screen.getByRole('button', { name: 'Particules de vent' })).toBeInTheDocument()

    useFieldModeStore.setState({ enabled: true, loaded: true })

    await vi.waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Particules de vent' }),
      ).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: 'Carte de potentiel' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Analyser cet endroit' }),
    ).not.toBeInTheDocument()
    // Real CompassDisplay is now shown instead — jsdom has no orientation
    // API, so it honestly reports unavailable rather than a fake heading.
    expect(screen.getByText(/pas prise en charge/)).toBeInTheDocument()
    expect(useWindStore.getState().enabled).toBe(false)
    expect(useWeatherMapStore.getState().enabled).toBe(false)

    vi.unstubAllGlobals()
  })
})

describe('MapPage — follow my position and "Aller à" (GPS simulated)', () => {
  const recentFix = (
    overrides: { lat?: number; ageMs?: number } = {},
  ): GeolocationReading => ({
    status: 'available',
    value: {
      lat: overrides.lat ?? 46.8,
      lng: -71.2,
      accuracyMeters: 8,
      timestampMs: Date.now() - (overrides.ageMs ?? 0),
    },
    confidence: 'measured',
    source: 'browser-geolocation',
  })

  /** Calls to the map's `setView` that only recentre (no zoom change). */
  const centerOnlyCalls = () =>
    setView.mock.calls.filter(([view]) => view && 'center' in view && !('zoom' in view))

  it('cannot start without a GPS fix, with the reason as its tooltip', () => {
    render(<MapPage />)
    const button = screen.getByRole('button', { name: 'Suivre ma position' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringContaining('Suivi indisponible'))
  })

  it('starts following: recentres once at field zoom, then on each recent fix without changing the zoom', async () => {
    mockGpsReading = recentFix()
    const user = userEvent.setup()
    const { rerender } = render(<MapPage />)

    await user.click(screen.getByRole('button', { name: 'Suivre ma position' }))
    expect(useFollowStore.getState().mode).toBe('following')
    expect(screen.getByRole('button', { name: 'Suivre ma position' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(setView).toHaveBeenCalledWith({ center: { lat: 46.8, lng: -71.2 }, zoom: 16 })

    setView.mockClear()
    mockGpsReading = recentFix({ lat: 46.8005 })
    rerender(<MapPage />)
    expect(centerOnlyCalls()).toEqual([[{ center: { lat: 46.8005, lng: -71.2 } }]])
  })

  it('pauses on a manual map gesture, stops recentring, and "Reprendre le suivi" resumes', async () => {
    mockGpsReading = recentFix()
    const user = userEvent.setup()
    const { rerender } = render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Suivre ma position' }))
    expect(screen.queryByRole('button', { name: 'Reprendre le suivi' })).toBeNull()

    act(() => lastCreateMapOptions?.onUserInteraction?.())
    expect(useFollowStore.getState().mode).toBe('paused')
    expect(screen.getByRole('button', { name: 'Reprendre le suivi' })).toBeVisible()

    setView.mockClear()
    mockGpsReading = recentFix({ lat: 46.801 })
    rerender(<MapPage />)
    expect(centerOnlyCalls()).toEqual([]) // never fights the user's gesture

    await user.click(screen.getByRole('button', { name: 'Reprendre le suivi' }))
    expect(useFollowStore.getState().mode).toBe('following')
    expect(centerOnlyCalls()).toEqual([[{ center: { lat: 46.801, lng: -71.2 } }]])
    expect(screen.queryByRole('button', { name: 'Reprendre le suivi' })).toBeNull()
  })

  it('a gesture while not following does nothing', () => {
    mockGpsReading = recentFix()
    render(<MapPage />)
    act(() => lastCreateMapOptions?.onUserInteraction?.())
    expect(useFollowStore.getState().mode).toBe('off')
  })

  it('never recentres on an old or stale fix', async () => {
    mockGpsReading = recentFix()
    const user = userEvent.setup()
    const { rerender } = render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Suivre ma position' }))

    setView.mockClear()
    mockGpsReading = recentFix({ lat: 46.81, ageMs: 10 * 60_000 })
    rerender(<MapPage />)
    mockGpsReading = recentFix({ lat: 46.82, ageMs: 60_000 })
    rerender(<MapPage />)
    expect(centerOnlyCalls()).toEqual([])
  })

  it('"Me localiser" still recentres once when not following', async () => {
    mockGpsReading = recentFix()
    const user = userEvent.setup()
    render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Me localiser' }))
    expect(setView).toHaveBeenCalledWith({ center: { lat: 46.8, lng: -71.2 }, zoom: 16 })
    expect(useFollowStore.getState().mode).toBe('off')
  })

  it('stops following when the map page is left', async () => {
    mockGpsReading = recentFix()
    const user = userEvent.setup()
    const { unmount } = render(<MapPage />)
    await user.click(screen.getByRole('button', { name: 'Suivre ma position' }))
    unmount()
    expect(useFollowStore.getState().mode).toBe('off')
  })

  it('"Aller à" draws the guidance line on the map, "Arrêter" clears it, and no track appears', async () => {
    mockGpsReading = recentFix()
    const saved = {
      id: 'w1',
      name: 'Mirador nord',
      coordinate: { lat: 46.801, lng: -71.2 },
      category: 'general' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    // The page loads waypoints from the database on mount.
    await db.waypoints.add(saved)
    useWaypointsStore.setState({ waypoints: [saved], loaded: true, editingId: 'w1' })
    const user = userEvent.setup()
    render(<MapPage />)

    await user.click(await screen.findByRole('button', { name: 'Aller à' }))
    expect(screen.getByTestId('guidance-panel')).toBeVisible()
    expect(useWaypointsStore.getState().editingId).toBeNull()
    expect(setGuidanceLine).toHaveBeenLastCalledWith([
      { lat: 46.8, lng: -71.2 },
      { lat: 46.801, lng: -71.2 },
    ])
    expect(setTrackPreview).toHaveBeenLastCalledWith(null)
    expect(useTracksStore.getState().status).toBe('idle')

    await user.click(screen.getByRole('button', { name: 'Arrêter le guidage' }))
    expect(setGuidanceLine).toHaveBeenLastCalledWith(null)
    expect(screen.queryByTestId('guidance-panel')).toBeNull()
  })
})
