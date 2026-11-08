import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { composeAnalysis, DEFAULT_INPUTS } from '../state/compose'
import { Dashboard } from './Dashboard'
import { RecommendationCard } from './RecommendationCard'

function recordAt(lat: number, lng: number) {
  return composeAnalysis({ ...DEFAULT_INPUTS, coordinate: { lat, lng }, startDateKey: '2026-11-08', days: 1 }, null, null, {
    now: new Date('2026-11-08T12:00:00Z'), forecastFetchedAt: null, fallbackTimeZone: 'America/Toronto',
  }).record
}
afterEach(cleanup)
describe('Visibilité de la recommandation', () => {
  it('reste visible sur le dashboard sans ouvrir les détails', () => {
    const record = recordAt(45.6, -72)
    render(<MemoryRouter><Dashboard result={{ record, origin: 'live', notes: [] }} onOpenParams={vi.fn()}/></MemoryRouter>)
    const card = screen.getByTestId('hunt-recommendation')
    expect(card).toBeVisible()
    expect(within(card).getByText(/Pour ce lieu et cette période/)).toBeVisible()
    expect(card.closest('details')).toBeNull()
  })
  it('annonce le manque de météo et ouvre les informations manquantes', async () => {
    const user = userEvent.setup()
    render(<RecommendationCard record={recordAt(45.6, -72)} dayIndex={0}/>)
    const card = screen.getByTestId('hunt-recommendation')
    expect(within(card).getByText(/Sans météo/)).toBeVisible()
    await user.click(within(card).getByText('Contexte saisonnier, informations manquantes et hypothèses'))
    expect(within(card).getByText(/Météo indisponible/)).toBeVisible()
    expect(card).not.toHaveTextContent(/favorable au poste/)
  })
  it('ne réintroduit pas de repère québécois hors territoire documenté', () => {
    render(<RecommendationCard record={recordAt(44, -80.5)} dayIndex={0}/>)
    expect(screen.getByTestId('hunt-recommendation')).toHaveTextContent(/Aucun repère saisonnier documenté/)
    expect(screen.getByTestId('hunt-recommendation')).not.toHaveTextContent(/fin octobre à mi-novembre/)
  })
})
