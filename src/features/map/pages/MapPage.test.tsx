import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapPage } from './MapPage'
import { useLayersStore } from '@/features/layers/state/layersStore'
import { useMapStore } from '../state/mapStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
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
let lastCreateMapOptions: CreateMapOptions | undefined
const createMap = vi.fn((options: CreateMapOptions) => {
  lastCreateMapOptions = options
  return { setView, setBaseLayer, setOverlayVisible, setUserLocationMarker, setWaypoints, destroy }
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
  })
  useWaypointsStore.setState({ waypoints: [], loaded: false, isPlacing: false, editingId: null })
  await db.waypoints.clear()
  lastCreateMapOptions = undefined
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
    expect(setView).toHaveBeenCalledWith({ pitch: 60, bearing: -20 })
    expect(button3D).toHaveAttribute('aria-pressed', 'true')

    await user.click(button2D)
    expect(setView).toHaveBeenCalledWith({ pitch: 0, bearing: 0 })
    expect(createMap).toHaveBeenCalledOnce()
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
    expect(await db.waypoints.toArray()).toEqual([])
    expect(screen.queryByRole('heading', { name: 'Waypoint' })).not.toBeInTheDocument()
  })
})
