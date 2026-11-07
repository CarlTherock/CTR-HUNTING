import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  it('sans point : propose de choisir sur la carte, sans ancien panneau ni formulaire', () => {
    renderPage()
    expect(
      screen.getByRole('button', { name: 'Choisir un point sur la carte' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Analyse environnementale/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Analyser' })).not.toBeInTheDocument()
  })

  it('point reçu : analyse initiale automatique, point conservé, dashboard immédiat', async () => {
    fetchPointForecast.mockResolvedValue(FORECAST)
    fetchLandCover.mockResolvedValue(LAND)
    renderPage('/hunt?lat=45.6&lng=-72.9')

    await screen.findByText('Meilleur créneau estimé')
    expect(screen.getByRole('img', { name: /Indice horaire/ })).toBeInTheDocument()
    expect(
      screen.getByText(/Estimation comparative — pas une garantie/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Voir sur la carte/)).toBeInTheDocument()
    // Pas de formulaire imposé : les paramètres sont derrière un bouton discret.
    expect(screen.queryByRole('button', { name: 'Analyser' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Paramètres/ })).toBeInTheDocument()
    // Le point touché est celui qui est analysé, une seule fois.
    expect(useHuntStore.getState().inputs.coordinate).toEqual({ lat: 45.6, lng: -72.9 })
    expect(fetchPointForecast).toHaveBeenCalledTimes(1)
    expect(fetchPointForecast.mock.calls[0]?.[0]).toEqual({ lat: 45.6, lng: -72.9 })
    expect(fetchLandCover).toHaveBeenCalledTimes(1)
  })

  it('les explications restent accessibles mais repliées', async () => {
    fetchPointForecast.mockResolvedValue(FORECAST)
    fetchLandCover.mockResolvedValue(LAND)
    const user = userEvent.setup()
    renderPage('/hunt?lat=45.6&lng=-72.9')
    await screen.findByText('Meilleur créneau estimé')

    const sources = screen
      .getByText('Sources, règles et bibliographie')
      .closest('details')
    expect(sources).not.toHaveAttribute('open')
    await user.click(screen.getByText('Sources, règles et bibliographie'))
    expect(sources).toHaveAttribute('open')
    const rules = screen.getByRole('region', { name: 'Règles' })
    expect(within(rules).getAllByText('Active').length).toBeGreaterThan(0)

    await user.click(screen.getByText('Secteurs, points et corridors'))
    expect(screen.getByText(/Secteurs d’habitat/)).toBeInTheDocument()
    expect(screen.getAllByText(/Corridors potentiels/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('button', { name: 'Créer un repère' }).length,
    ).toBeGreaterThan(0)

    await user.click(screen.getByText('Formule, méthodologie et limites'))
    expect(screen.getAllByText(/non évaluée/).length).toBeGreaterThan(0)
  })

  it('le bouton Paramètres ouvre le formulaire (lieu, date, emprise)', async () => {
    fetchPointForecast.mockResolvedValue(FORECAST)
    fetchLandCover.mockResolvedValue(LAND)
    const user = userEvent.setup()
    renderPage('/hunt?lat=45.6&lng=-72.9')
    await screen.findByText('Meilleur créneau estimé')
    await user.click(screen.getByRole('button', { name: /Paramètres/ }))
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeInTheDocument()
  })

  it('hors ligne : dit ce qui manque au lieu d’inventer des secteurs', async () => {
    fetchPointForecast.mockRejectedValue(new Error('hors ligne'))
    fetchLandCover.mockRejectedValue(new Error('hors ligne'))
    renderPage('/hunt?lat=45.6&lng=-72.9')
    await screen.findByText(/Réseau indisponible/)
    expect(screen.getByText(/Occupation du sol indisponible/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Voir sur la carte' })).toBeDisabled()
  })
})
