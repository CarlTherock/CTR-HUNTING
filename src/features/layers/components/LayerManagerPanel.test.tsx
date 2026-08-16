import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LayerManagerPanel } from './LayerManagerPanel'
import { useLayersStore } from '../state/layersStore'
import type { MapBaseLayerId } from '@/types'

let mockAvailableBaseLayers: MapBaseLayerId[] = ['outdoor', 'satellite']

vi.mock('@/services/map', () => ({
  get availableBaseLayers() {
    return mockAvailableBaseLayers
  },
}))

afterEach(() => {
  mockAvailableBaseLayers = ['outdoor', 'satellite']
  useLayersStore.setState({
    baseLayer: 'outdoor',
    overlays: { trails: true, hydrography: true, contours: true },
  })
})

describe('LayerManagerPanel', () => {
  it('only offers base layers whose vendor key is actually configured', () => {
    mockAvailableBaseLayers = ['outdoor', 'satellite']
    render(<LayerManagerPanel />)

    expect(screen.getByRole('radio', { name: 'Outdoor (topo)' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Satellite' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Topographic' })).not.toBeInTheDocument()
    expect(screen.queryByText('Esri')).not.toBeInTheDocument()
  })

  it('shows Esri options, grouped under an "Esri" heading, once its key is configured', () => {
    mockAvailableBaseLayers = ['outdoor', 'satellite', 'esri-topographic', 'esri-hillshade']
    render(<LayerManagerPanel />)

    expect(screen.getByText('MapTiler')).toBeInTheDocument()
    expect(screen.getByText('Esri')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Topographic' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Hillshade' })).toBeInTheDocument()
    // Not configured — must not appear even though it's a known option.
    expect(screen.queryByRole('radio', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('selecting an Esri base layer updates the store', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    mockAvailableBaseLayers = ['outdoor', 'esri-terrain']
    const user = userEvent.setup()
    render(<LayerManagerPanel />)

    await user.click(screen.getByRole('radio', { name: 'Terrain' }))
    expect(useLayersStore.getState().baseLayer).toBe('esri-terrain')
  })
})
