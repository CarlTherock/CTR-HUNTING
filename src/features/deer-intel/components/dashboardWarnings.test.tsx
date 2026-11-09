import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { composeAnalysis, DEFAULT_INPUTS } from '../state/compose'
import { Dashboard } from './Dashboard'

afterEach(cleanup)
function show(notes: string[]) {
  const { record } = composeAnalysis({ ...DEFAULT_INPUTS, coordinate: { lat: 46.8, lng: -71.2 }, startDateKey: '2026-11-09', days: 1 }, null, null, { now: new Date('2026-11-09T12:00:00Z'), forecastFetchedAt: null, fallbackTimeZone: 'America/Toronto' })
  render(<MemoryRouter><Dashboard result={{ record, origin: 'live', notes }} onOpenParams={vi.fn()}/></MemoryRouter>)
}

describe('avertissements visibles du dashboard', () => {
  it('affiche les avertissements réseau sans ouvrir de détails', () => {
    show(['Réseau indisponible : référence astronomique seulement.'])
    const notes = screen.getByTestId('hunt-data-notes')
    expect(notes.closest('details')).toBeNull()
    expect(within(notes).getByText(/Réseau indisponible/)).toBeVisible()
  })
  it('affiche la cause fournisseur une seule fois sans la masquer', () => {
    show(['Occupation du sol indisponible. Cause : overpass-api.de a répondu HTTP 504.'])
    expect(screen.getByText(/overpass-api.de a répondu HTTP 504/)).toBeVisible()
    expect(screen.getAllByText(/overpass-api.de a répondu HTTP 504/)).toHaveLength(1)
  })
  it('rend le diagnostic accessible une seule fois sans analyse spatiale', () => {
    show([])
    const button = screen.getByRole('button', { name: 'Vérifier les services' })
    expect(button).toBeVisible()
    expect(button.closest('details')).toBeNull()
    expect(screen.getAllByTestId('service-check')).toHaveLength(1)
  })
  it('ne fabrique pas de message quand les notes sont vides', () => {
    show([])
    expect(screen.queryByTestId('hunt-data-notes')).toBeNull()
  })
})
