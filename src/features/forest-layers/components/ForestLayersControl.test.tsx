import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FOREST_LAYER_OPTIONS } from '@/services/map/forestLayerTiles'
import { useForestLayersStore } from '../state/forestLayersStore'
import { ForestLayersControl } from './ForestLayersControl'

const layer = FOREST_LAYER_OPTIONS[0]

beforeEach(() => {
  useForestLayersStore.setState({
    enabled: { [layer.id]: true },
    status: {
      [layer.id]: { state: 'error', message: 'Erreur typée', errorKind: 'tile-failure' },
    },
    retries: {},
  })
})

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Couches du Québec/ }))
}

describe('ForestLayersControl error handling', () => {
  it('shows the typed message and a retry that stops after the allowed attempts', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ForestLayersControl currentZoom={14} onRetry={onRetry} />)
    await openPanel(user)

    expect(screen.getByRole('alert')).toHaveTextContent('Erreur typée')
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'Réessayer' }))
    }
    expect(onRetry).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledWith(layer.id)
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expect(screen.getByText(/Plusieurs essais ont échoué/)).toBeVisible()
  })

  it('does not offer a retry for a layer the service does not know', async () => {
    useForestLayersStore.setState({
      status: {
        [layer.id]: { state: 'error', message: 'Inconnue', errorKind: 'layer-not-found' },
      },
    })
    const user = userEvent.setup()
    render(<ForestLayersControl currentZoom={14} />)
    await openPanel(user)
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
  })
})
