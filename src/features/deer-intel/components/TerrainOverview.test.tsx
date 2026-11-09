import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { TerrainOverview } from './TerrainOverview'
import { analyzeSpatial, defaultSpatialParams } from '../spatial/analyzeSpatial'
import type { CandidatePoint, SpatialAnalysis } from '../spatial/types'
import { useHuntStore } from '../state/huntStore'

const initial = useHuntStore.getState()
afterEach(() => { cleanup(); useHuntStore.setState(initial, true) })
function LocationEcho() {
  return <output data-testid="test-location">{useLocation().pathname}</output>
}
function show(spatial: SpatialAnalysis | null) {
  render(<MemoryRouter initialEntries={['/hunt']}><TerrainOverview spatial={spatial}/><LocationEcho/></MemoryRouter>)
}
function spatialWithPoint(): SpatialAnalysis {
  const base = analyzeSpatial(defaultSpatialParams({ lat: 45.6, lng: -72 }, 500), null)
  const point: CandidatePoint = { id: 'P1', grade: 'B', score: 70, coordinate: { lat: 45.6, lng: -72 }, distanceFromCenterM: 100, sectorId: null, reasons: ['Couvert forestier'], missing: ['Relief non intégré'] }
  return { ...base, coverage: 0.5, candidates: [point] }
}

describe('accès terrain depuis le dashboard', () => {
  it('ne place pas la synthèse dans un panneau replié', () => {
    show(spatialWithPoint())
    const panel = screen.getByTestId('hunt-terrain-overview')
    expect(panel).toBeVisible()
    expect(panel.closest('details')).toBeNull()
    expect(within(panel).getByRole('heading', { name: 'Où prospecter' })).toBeVisible()
  })
  it('désactive la carte sans analyse spatiale', () => {
    show(null)
    expect(screen.getByRole('button', { name: 'Explorer la carte' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Voir P1 sur la carte' })).toBeNull()
    expect(screen.getByText(/Aucune analyse spatiale disponible/)).toBeVisible()
  })
  it('ouvre la carte avec le point choisi et rend la couche visible', () => {
    useHuntStore.setState({ mapVisible: false, selectedCandidateId: null })
    const token = useHuntStore.getState().focusToken
    show(spatialWithPoint())
    fireEvent.click(screen.getByRole('button', { name: 'Voir P1 sur la carte' }))
    expect(screen.getByTestId('test-location')).toHaveTextContent('/map')
    expect(useHuntStore.getState().selectedCandidateId).toBe('P1')
    expect(useHuntStore.getState().mapVisible).toBe(true)
    expect(useHuntStore.getState().focusToken).toBe(token + 1)
  })
  it('la vue globale ne conserve pas un ancien point sélectionné', () => {
    useHuntStore.setState({ selectedCandidateId: 'ancien' })
    show(spatialWithPoint())
    fireEvent.click(screen.getByRole('button', { name: 'Explorer la carte' }))
    expect(screen.getByTestId('test-location')).toHaveTextContent('/map')
    expect(useHuntStore.getState().selectedCandidateId).toBeNull()
  })
  it('sépare la couverture cartographique d’une probabilité de présence', () => {
    show(spatialWithPoint())
    expect(screen.getByText(/Couverture des données : 50 %/)).toBeVisible()
    expect(screen.getByText(/Ce pourcentage ne mesure pas la présence de cerfs/)).toBeVisible()
    expect(screen.getByText(/pas une piste observée/)).toBeVisible()
  })
})
