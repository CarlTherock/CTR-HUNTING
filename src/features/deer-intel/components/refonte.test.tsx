import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { DEFAULT_HUNT_LAYERS, useHuntPresentationStore } from '../state/presentationStore'
import { createHuntLayer, HUNT_CORRIDOR_LINE_ID } from '@/services/map/huntLayer'
import RutPage from '@/features/rut/pages/RutPage'
vi.mock('@/features/journal/state/journalStore', () => ({ useJournalStore: () => { throw new Error('Le journal ne doit pas être sollicité par défaut') } }))
vi.mock('@/features/waypoints/state/tracksStore', () => ({ useTracksStore: () => { throw new Error('Les traces ne doivent pas être sollicitées par défaut') } }))
afterEach(() => { cleanup(); useHuntPresentationStore.setState({ dateKey: null, layers: { ...DEFAULT_HUNT_LAYERS } }) })
describe('Refonte intégrée', () => {
  it('affiche le rut sans consulter le journal ni les traces', () => {
    render(<MemoryRouter><RutPage/></MemoryRouter>)
    expect(screen.getByTestId('rut-band-quebec')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Afficher mes observations facultatives' })).toHaveAttribute('aria-expanded', 'false')
  })
  it('sépare les réglages de présentation des données calculées', () => {
    useHuntPresentationStore.getState().setDateKey('2026-11-07')
    useHuntPresentationStore.getState().setLayer('corridors', false)
    expect(useHuntPresentationStore.getState().layers).toEqual({ ...DEFAULT_HUNT_LAYERS, corridors: false })
    expect(useHuntPresentationStore.getState().dateKey).toBe('2026-11-07')
  })
  it('applique une couche indépendamment et conserve son état après changement de style', () => {
    const on = vi.fn(), setLayoutProperty = vi.fn()
    const map = { on, getLayer: vi.fn(() => ({})), setLayoutProperty, addSource: vi.fn(), addLayer: vi.fn() }
    const layer = createHuntLayer(map as unknown as MapLibreMap)
    try {
      layer.addToStyle()
      useHuntPresentationStore.getState().setLayer('corridors', false)
      expect(setLayoutProperty).toHaveBeenCalledWith(HUNT_CORRIDOR_LINE_ID, 'visibility', 'none')
      setLayoutProperty.mockClear()
      layer.addToStyle()
      expect(setLayoutProperty).toHaveBeenCalledWith(HUNT_CORRIDOR_LINE_ID, 'visibility', 'none')
    } finally { const stop = on.mock.calls.find((args) => args[0] === 'remove')?.[1]; if (typeof stop === 'function') stop() }
  })
})
