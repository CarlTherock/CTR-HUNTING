import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { PointForecast } from '@/types'
import { db } from '@/database/db'

const fetchPointForecast = vi.fn()
const fetchLandCover = vi.fn()
vi.mock('@/services/weather', () => ({ weatherProvider: { fetchPointForecast } }))
vi.mock('@/services/landcover/OverpassLandCoverProvider', () => ({
  landCoverProvider: { fetchLandCover },
}))

const { default: HuntPage } = await import('./HuntPage')
const { useHuntStore } = await import('../state/huntStore')
const { DEFAULT_INPUTS } = await import('../state/compose')

const FORECAST: PointForecast = { timezone: 'America/Toronto', hourly: [], daily: [] }
const ring = (lat0: number, lng0: number) => [
  { lat: lat0, lng: lng0 },
  { lat: lat0, lng: lng0 + 0.006 },
  { lat: lat0 + 0.005, lng: lng0 + 0.006 },
  { lat: lat0 + 0.005, lng: lng0 },
  { lat: lat0, lng: lng0 },
]
const LAND = {
  polygons: [
    { id: 'f', landClass: 'forest', rings: [ring(45.595, -72.906)] },
    { id: 'a', landClass: 'agricultural', rings: [ring(45.595, -72.9)] },
  ],
  source: 'OpenStreetMap (test)',
  fetchedAt: '2026-11-06T12:00:00.000Z',
}

beforeEach(async () => {
  fetchPointForecast.mockReset()
  fetchLandCover.mockReset()
  await db.huntAnalyses.clear()
  useHuntStore.setState({
    inputs: { ...DEFAULT_INPUTS },
    status: 'idle',
    result: null,
    error: null,
    saved: [],
  })
})

function renderPage(url = '/hunt') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <HuntPage />
    </MemoryRouter>,
  )
}

describe('HuntPage', () => {
  it('sans point GPS, le bouton Analyser est désactivé et l’aide est affichée', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled()
    expect(screen.getByText(/Choisissez un point GPS/)).toBeInTheDocument()
  })

  it('reprend le point reçu de la carte, analyse sans observation et montre QUAND, OÙ, COMMENT et Sources', async () => {
    fetchPointForecast.mockResolvedValue(FORECAST)
    fetchLandCover.mockResolvedValue(LAND)
    const user = userEvent.setup()
    renderPage('/hunt?lat=45.6&lng=-72.9')
    const run = screen.getByRole('button', { name: 'Analyser' })
    await waitFor(() => expect(run).toBeEnabled())
    await user.click(run)

    await screen.findByText(/Calculée maintenant/)
    expect(screen.getByText(/Pourquoi ce créneau/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Indice horaire/ })).toBeInTheDocument()
    expect(screen.getByText(/Aucun bonus lunaire/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'OÙ' }))
    expect(screen.getByText(/Secteurs d’habitat/)).toBeInTheDocument()
    expect(screen.getByText(/Corridors potentiels/)).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Créer un repère' }).length,
    ).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: 'COMMENT' }))
    expect(screen.getByText(/non évaluée/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Sources' }))
    const rules = screen.getByRole('region', { name: 'Règles' })
    expect(within(rules).getAllByText('Active').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/Aucune référence n’est présentée comme lue intégralement/),
    ).toBeInTheDocument()
  })

  it('hors ligne : dit ce qui manque au lieu d’inventer des secteurs', async () => {
    fetchPointForecast.mockRejectedValue(new Error('hors ligne'))
    fetchLandCover.mockRejectedValue(new Error('hors ligne'))
    const user = userEvent.setup()
    renderPage('/hunt?lat=45.6&lng=-72.9')
    const run = screen.getByRole('button', { name: 'Analyser' })
    await waitFor(() => expect(run).toBeEnabled())
    await user.click(run)
    await screen.findByText(/Réseau indisponible/)
    await user.click(screen.getByRole('tab', { name: 'OÙ' }))
    expect(screen.getByText(/Aucune donnée d’occupation du sol/)).toBeInTheDocument()
  })
})
