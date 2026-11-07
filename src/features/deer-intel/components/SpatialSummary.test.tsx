import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SpatialSummary } from './SpatialSummary'
import { analyzeSpatial, defaultSpatialParams } from '../spatial/analyzeSpatial'
import type { SpatialAnalysis } from '../spatial/types'

vi.mock('./ServiceCheck', () => ({ ServiceCheck: () => <p>Contrôle des services</p> }))
afterEach(cleanup)
function spatial(coverage: number): SpatialAnalysis {
  return { ...analyzeSpatial(defaultSpatialParams({ lat: 45.6, lng: -72.9 }, 500), null), coverage, source: { name: 'Source de test', fetchedAt: '2026-11-07T12:00:00Z' } }
}
function show(value: SpatialAnalysis | null) {
  render(<MemoryRouter><SpatialSummary spatial={value} /></MemoryRouter>)
}
describe('synthèse spatiale du dashboard', () => {
  it('service indisponible : pas de faux pourcentage et bouton carte désactivé', () => {
    show(null)
    expect(screen.getByText(/Aucune donnée d’occupation du sol exploitable/)).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('button', { name: 'Voir sur la carte' }).hasAttribute('disabled')).toBe(true)
  })
  it('le message du fournisseur reste unique lorsque la carte est vide', () => {
    render(<MemoryRouter>
      <p>Occupation du sol indisponible : aucun secteur ni point candidat. Cause : HTTP 502.</p>
      <SpatialSummary spatial={null} />
    </MemoryRouter>)
    expect(screen.getAllByText(/Occupation du sol indisponible/)).toHaveLength(1)
    expect(screen.getByText(/Aucune donnée d’occupation du sol exploitable/)).toBeTruthy()
    expect(screen.getByText('Contrôle des services')).toBeTruthy()
  })
  it('couverture nulle : absence de donnée, pas habitat défavorable', () => {
    show(spatial(0))
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0')
    expect(screen.getByText(/Aucune cellule classée/)).toBeTruthy()
    expect(screen.getByText(/Une zone sans donnée n’est pas une zone défavorable/)).toBeTruthy()
  })
  it('couverture partielle : expose la mesure et la provenance sans la confondre avec un score', () => {
    show(spatial(0.375))
    expect(screen.getByRole('progressbar', { name: 'Couverture des données cartographiques' }).getAttribute('aria-valuenow')).toBe('37.5')
    expect(screen.getByText(/Source de test/)).toBeTruthy()
    expect(screen.getByText(/Des données sont présentes/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Voir sur la carte' }).hasAttribute('disabled')).toBe(false)
  })
  it('une couverture invalide ne devient pas artificiellement 0 ou 100 %', () => {
    show(spatial(Number.NaN))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('Indisponible')).toBeTruthy()
  })
})
