import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/database/db'
import { useJournalStore } from '@/features/journal/state/journalStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import DeerTrackerPage from './DeerTrackerPage'

const NO_GPS: GeolocationReading = {
  status: 'unavailable',
  kind: 'unavailable',
  reason: 'indisponible',
}
let mockGps: GeolocationReading = NO_GPS
vi.mock('@/features/gps/useGeolocation', () => ({ useGeolocation: () => mockGps }))
vi.mock('@/features/camera/components/CameraCapture', () => ({
  CameraCapture: () => null,
}))
vi.mock('@/services/map', () => ({ mapProvider: null, availableBaseLayers: [] }))

function renderPage() {
  return render(
    <MemoryRouter>
      <DeerTrackerPage />
    </MemoryRouter>,
  )
}

afterEach(async () => {
  await db.observations.clear()
  await db.territories.clear()
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
  })
  mockGps = NO_GPS
  useJournalStore.setState({ observations: [], loaded: false, editingId: null })
})

const gpsFix = (accuracyMeters: number): GeolocationReading => ({
  status: 'available',
  confidence: 'measured',
  source: 'browser-geolocation',
  value: { lat: 46.8, lng: -71.2, accuracyMeters, timestampMs: Date.now() },
})

describe('DeerTrackerPage', () => {
  it('states what DeerTracker is not, and shows an honest empty state', async () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'DeerTracker — Suivi des cerfs' }),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(/ni la localisation en direct d’un animal sauvage/).length,
    ).toBeGreaterThan(0)
    expect(
      await screen.findByText('Aucune observation de cerf pour le moment'),
    ).toBeInTheDocument()
  })

  it('records a quick observation from the GPS and locks the position afterwards', async () => {
    const user = userEvent.setup()
    mockGps = gpsFix(6)
    renderPage()
    await user.click(screen.getByRole('button', { name: /Enregistrer une observation/ }))
    const form = screen.getByRole('form', { name: 'Nouvelle observation' })
    expect(within(form).getByText(/GPS ±6 m/)).toBeInTheDocument()
    await user.click(within(form).getByRole('radio', { name: 'Piste / empreinte' }))
    await user.click(within(form).getByRole('button', { name: /Enregistrer/ }))

    await waitFor(async () => expect(await db.observations.count()).toBe(1))
    const saved = (await db.observations.toArray())[0]
    expect(saved.deer).toEqual({ kind: 'track' }) // nothing invented: no count, sex, age...
    expect(saved.positionOrigin).toBe('gps')
    expect(saved.coordinate).toEqual({ lat: 46.8, lng: -71.2, accuracyMeters: 6 })
    expect(saved.createdAt).toBeDefined()

    // Edit a detail: the point never moves.
    const detail = await screen.findByRole('region', { name: 'Détails de l’observation' })
    expect(within(detail).getByText('Position verrouillée')).toBeInTheDocument()
    await user.selectOptions(within(detail).getByLabelText('Sexe'), 'female')
    await waitFor(async () =>
      expect((await db.observations.get(saved.id))?.deer?.sex).toBe('female'),
    )
    expect((await db.observations.get(saved.id))?.coordinate).toEqual(saved.coordinate)
  })

  it('without a GPS fix, saving needs an explicit manual position (never invented)', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Enregistrer une observation/ }))
    const form = screen.getByRole('form', { name: 'Nouvelle observation' })
    expect(within(form).getByText(/Position absente/)).toBeInTheDocument()
    const save = within(form).getByRole('button', { name: /Enregistrer/ })
    expect(save).toBeDisabled()
    await user.click(within(form).getByRole('radio', { name: /Centre de la carte/ }))
    expect(within(form).getByText(/Position manuelle/)).toBeInTheDocument()
    expect(save).toBeEnabled()
    await user.click(save)
    await waitFor(async () => expect(await db.observations.count()).toBe(1))
    expect((await db.observations.toArray())[0].positionOrigin).toBe('manual')
  })

  it('shows only classified entries, filters by type, and summarises without claims', async () => {
    const user = userEvent.setup()
    await db.observations.bulkAdd([
      {
        id: 'a',
        coordinate: { lat: 46, lng: -71 },
        timestamp: new Date(2026, 9, 1, 6, 30).toISOString(),
        notes: 'vu',
        deer: { kind: 'sighting', count: 2 },
      },
      {
        id: 'b',
        coordinate: { lat: 46, lng: -71 },
        timestamp: new Date(2026, 9, 2, 17, 0).toISOString(),
        notes: '',
        deer: { kind: 'rub' },
      },
      {
        id: 'plain',
        coordinate: { lat: 46, lng: -71 },
        timestamp: new Date(2026, 9, 3, 9, 0).toISOString(),
        notes: 'journal ordinaire',
      },
    ])
    await useJournalStore.getState().load()
    renderPage()
    const list = await screen.findByRole('list', { name: 'Observations' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).queryByText('journal ordinaire')).not.toBeInTheDocument()
    expect(screen.getByTestId('deer-summary-count')).toHaveTextContent('2 observation(s)')

    await user.click(screen.getByRole('button', { name: 'Frottis' }))
    expect(
      within(screen.getByRole('list', { name: 'Observations' })).getAllByRole('listitem'),
    ).toHaveLength(1)
    expect(screen.getByTestId('deer-summary-count')).toHaveTextContent('1 observation(s)')
    expect(screen.getAllByText(/pas la population réelle/).length).toBeGreaterThan(0)
  })

  it('classifies an ordinary journal entry only when the user chooses to', async () => {
    const user = userEvent.setup()
    await db.observations.add({
      id: 'plain',
      coordinate: { lat: 46, lng: -71 },
      timestamp: '2026-10-03T09:00:00.000Z',
      notes: 'grattage près du ruisseau',
    })
    await useJournalStore.getState().load()
    renderPage()
    expect(
      await screen.findByText('Aucune observation de cerf pour le moment'),
    ).toBeInTheDocument()
    expect((await db.observations.get('plain'))?.deer).toBeUndefined()
    await user.selectOptions(
      await screen.findByLabelText('Entrée du journal à classer'),
      'plain',
    )
    await user.click(screen.getByRole('button', { name: 'Classer dans DeerTracker' }))
    await waitFor(async () =>
      expect((await db.observations.get('plain'))?.deer).toEqual({ kind: 'other_sign' }),
    )
    expect(await db.observations.count()).toBe(1) // no duplication
  })
})
