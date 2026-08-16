import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapPage } from './MapPage'
import { useLayersStore } from '@/features/layers/state/layersStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'

// jsdom has no WebGL context, so MapLibre GL JS cannot run in tests — the
// point of the MapProvider adapter is that feature code (and its tests)
// never need to know that; we mock the adapter, not the map engine.
const destroy = vi.fn()
const setBaseLayer = vi.fn()
const setOverlayVisible = vi.fn()
const setView = vi.fn()
const setUserLocationMarker = vi.fn()
const createMap = vi.fn(() => ({
  setView,
  setBaseLayer,
  setOverlayVisible,
  setUserLocationMarker,
  destroy,
}))

let mockProvider: { createMap: typeof createMap } | null = { createMap }

vi.mock('@/services/map', () => ({
  get mapProvider() {
    return mockProvider
  },
}))

let mockGpsReading: GeolocationReading = {
  status: 'unavailable',
  reason: 'Geolocation is not supported by this browser.',
}

vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => mockGpsReading,
}))

afterEach(() => {
  vi.clearAllMocks()
  mockProvider = { createMap }
  mockGpsReading = { status: 'unavailable', reason: 'Geolocation is not supported by this browser.' }
  useLayersStore.setState({
    baseLayer: 'outdoor',
    overlays: { trails: true, hydrography: true, contours: true },
  })
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
    expect(setView).toHaveBeenCalledWith({ center: { lat: 46.8, lng: -71.2 } })
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
})
