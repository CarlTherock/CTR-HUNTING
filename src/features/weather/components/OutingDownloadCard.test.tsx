import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OutingDownloadCard } from './OutingDownloadCard'
import { useSavedForecastsStore } from '../offline/savedForecastsStore'
import { buildSavedForecast, windZoneBounds } from '../offline/savedForecastLogic'
import { QUEBEC, makePoint, makeWindField } from '../offline/savedForecastFixtures'
import { db } from '@/database/db'
import { putSavedForecast } from '@/database/savedForecastsRepository'

const fetchPointForecast = vi.fn()
const fetchWindField = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchPointForecast: (...a: unknown[]) => fetchPointForecast(...a) },
}))
vi.mock('@/services/wind', () => ({
  windProvider: { fetchWindField: (...a: unknown[]) => fetchWindField(...a) },
}))

const C = QUEBEC.coordinate

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

beforeEach(async () => {
  setOnline(true)
  await db.savedForecasts.clear()
  useSavedForecastsStore.setState({
    items: [],
    loaded: false,
    busy: false,
    outcome: null,
    loadError: null,
  })
})

afterEach(() => {
  vi.clearAllMocks()
  setOnline(true)
})

describe('OutingDownloadCard', () => {
  it('shows the covered dates before downloading, with 72 h as default', async () => {
    render(<OutingDownloadCard gps={null} mapCenter={C} />)
    expect(await screen.findByTestId('download-dates')).toHaveTextContent(/72 h/)
    expect(screen.getByTestId('download-dates')).toHaveTextContent(/3 jours/)
    expect(screen.getByRole('button', { name: 'Ma position' })).toBeDisabled()
    expect(screen.getByText(/Données météo Open-Meteo\.com/)).toBeInTheDocument()
    expect(
      screen.getByText(/pas un champ couvrant tout un territoire/),
    ).toBeInTheDocument()
  })

  it('downloads for the chosen place and lists it with the saved status', async () => {
    fetchPointForecast.mockResolvedValue(makePoint('2026-11-02', 3))
    fetchWindField.mockResolvedValue(makeWindField(C, '2026-11-02', 3))
    const user = userEvent.setup()
    render(<OutingDownloadCard gps={null} mapCenter={C} />)
    await user.click(screen.getByRole('button', { name: 'Télécharger pour ma sortie' }))
    expect(await screen.findByTestId('download-outcome')).toHaveTextContent(
      /Téléchargement complet/,
    )
    const item = await screen.findByTestId('saved-forecast')
    expect(within(item).getByText('Centre de la carte')).toBeInTheDocument()
    expect(within(item).getByText('Prévisions enregistrées')).toBeInTheDocument()
  })

  it('offline: the download button is disabled but saved forecasts remain readable', async () => {
    await putSavedForecast(
      buildSavedForecast({
        id: 'x',
        place: QUEBEC,
        point: makePoint('2026-11-02', 3),
        windField: makeWindField(C, '2026-11-02', 3),
        windBounds: windZoneBounds(C),
        requestedDays: 3,
        fetchedAt: '2026-11-02T14:00:00.000Z',
      }),
    )
    setOnline(false)
    const user = userEvent.setup()
    render(<OutingDownloadCard gps={null} mapCenter={C} />)
    const item = await screen.findByTestId('saved-forecast')
    expect(
      screen.getByRole('button', { name: 'Télécharger pour ma sortie' }),
    ).toBeDisabled()
    expect(
      within(item).getByText(/Hors ligne — prévisions téléchargées le/),
    ).toBeInTheDocument()
    await user.click(within(item).getByRole('button', { name: 'Consulter' }))
    expect(within(item).getAllByText(/km\/h/).length).toBeGreaterThan(0)
  })

  it('shows « indisponible » for absent values, never 0', async () => {
    await putSavedForecast(
      buildSavedForecast({
        id: 'y',
        place: QUEBEC,
        point: makePoint('2026-11-02', 3, { patch: () => ({ windGustsKmh: null }) }),
        windField: makeWindField(C, '2026-11-02', 3),
        windBounds: windZoneBounds(C),
        requestedDays: 3,
        fetchedAt: '2026-11-02T14:00:00.000Z',
      }),
    )
    const user = userEvent.setup()
    render(<OutingDownloadCard gps={null} mapCenter={C} />)
    const item = await screen.findByTestId('saved-forecast')
    await user.click(within(item).getByRole('button', { name: 'Consulter' }))
    expect(within(item).getAllByText(/rafales indisponible/).length).toBeGreaterThan(0)
  })

  it('deleting asks for confirmation first', async () => {
    await putSavedForecast(
      buildSavedForecast({
        id: 'z',
        place: QUEBEC,
        point: makePoint('2026-11-02', 3),
        windField: makeWindField(C, '2026-11-02', 3),
        windBounds: windZoneBounds(C),
        requestedDays: 3,
        fetchedAt: '2026-11-02T14:00:00.000Z',
      }),
    )
    const user = userEvent.setup()
    render(<OutingDownloadCard gps={null} mapCenter={C} />)
    const item = await screen.findByTestId('saved-forecast')
    await user.click(within(item).getByRole('button', { name: 'Supprimer' }))
    expect(await db.savedForecasts.count()).toBe(1)
    await user.click(
      within(item).getByRole('button', { name: 'Confirmer la suppression' }),
    )
    expect(await db.savedForecasts.count()).toBe(0)
  })
})
