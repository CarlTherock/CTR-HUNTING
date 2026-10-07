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

async function openPanel() {
  const { default: userEvent } = await import('@testing-library/user-event')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Couches' }))
  return user
}

describe('LayerManagerPanel', () => {
  it('is collapsed by default so it never covers the map at startup', () => {
    render(<LayerManagerPanel />)

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Couches' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('only offers base layers whose vendor key is actually configured', async () => {
    mockAvailableBaseLayers = ['outdoor', 'satellite']
    render(<LayerManagerPanel />)
    await openPanel()

    expect(screen.getByRole('radio', { name: 'Plein air (topo)' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Satellite' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Topographique' })).not.toBeInTheDocument()
    expect(screen.queryByText('Esri')).not.toBeInTheDocument()
  })

  it('shows Esri options, grouped under an "Esri" heading, once its key is configured', async () => {
    mockAvailableBaseLayers = [
      'outdoor',
      'satellite',
      'esri-topographic',
      'esri-hillshade',
    ]
    render(<LayerManagerPanel />)
    await openPanel()

    expect(screen.getByText('MapTiler')).toBeInTheDocument()
    expect(screen.getByText('Esri')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Topographique' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Ombrage du relief' })).toBeInTheDocument()
    // Not configured — must not appear even though it's a known option.
    expect(screen.queryByRole('radio', { name: 'Navigation' })).not.toBeInTheDocument()
  })

  it('selecting an Esri base layer updates the store', async () => {
    mockAvailableBaseLayers = ['outdoor', 'esri-terrain']
    render(<LayerManagerPanel />)
    const user = await openPanel()

    await user.click(screen.getByRole('radio', { name: 'Relief' }))
    expect(useLayersStore.getState().baseLayer).toBe('esri-terrain')
  })

  it('collapses to a reopen button after picking a base layer, so it stops covering the map', async () => {
    render(<LayerManagerPanel />)
    const user = await openPanel()

    await user.click(screen.getByRole('radio', { name: 'Satellite' }))

    expect(screen.queryByRole('radio', { name: 'Satellite' })).not.toBeInTheDocument()
    const reopenButton = screen.getByRole('button', { name: 'Couches' })
    expect(reopenButton).toBeInTheDocument()

    await user.click(reopenButton)
    expect(screen.getByRole('radio', { name: 'Satellite' })).toBeInTheDocument()
  })

  it('does not collapse when toggling an overlay', async () => {
    render(<LayerManagerPanel />)
    const user = await openPanel()

    await user.click(screen.getByRole('checkbox', { name: 'Sentiers' }))

    expect(screen.getByRole('radio', { name: 'Satellite' })).toBeInTheDocument()
  })
})
