import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MapPage } from './MapPage'

// jsdom has no WebGL context, so MapLibre GL JS cannot run in tests — the
// point of the MapProvider adapter is that feature code (and its tests)
// never need to know that; we mock the adapter, not the map engine.
const destroy = vi.fn()
const createMap = vi.fn(() => ({ setView: vi.fn(), destroy }))

let mockProvider: { createMap: typeof createMap } | null = { createMap }

vi.mock('@/services/map', () => ({
  get mapProvider() {
    return mockProvider
  },
}))

afterEach(() => {
  vi.clearAllMocks()
  mockProvider = { createMap }
})

describe('MapPage', () => {
  it('mounts the map via the provider adapter and tears it down on unmount', () => {
    const { unmount } = render(<MapPage />)

    expect(screen.getByTestId('map-container')).toBeInTheDocument()
    expect(createMap).toHaveBeenCalledOnce()

    unmount()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('shows an explicit unavailable state when no provider is configured', () => {
    mockProvider = null
    render(<MapPage />)

    expect(screen.getByText('Map unavailable')).toBeInTheDocument()
    expect(createMap).not.toHaveBeenCalled()
  })
})
