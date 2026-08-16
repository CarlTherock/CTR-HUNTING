import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapPage } from './MapPage'
import { useLayersStore } from '@/features/layers/state/layersStore'

// jsdom has no WebGL context, so MapLibre GL JS cannot run in tests — the
// point of the MapProvider adapter is that feature code (and its tests)
// never need to know that; we mock the adapter, not the map engine.
const destroy = vi.fn()
const setBaseLayer = vi.fn()
const createMap = vi.fn(() => ({ setView: vi.fn(), setBaseLayer, destroy }))

let mockProvider: { createMap: typeof createMap } | null = { createMap }

vi.mock('@/services/map', () => ({
  get mapProvider() {
    return mockProvider
  },
}))

afterEach(() => {
  vi.clearAllMocks()
  mockProvider = { createMap }
  useLayersStore.setState({ baseLayer: 'outdoor' })
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
})
