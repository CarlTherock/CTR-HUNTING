import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/database/db'
import { useAddPointStore } from '@/features/addpoint/state/addPointStore'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import AfterShotPage from './AfterShotPage'

const navigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => ({
    status: 'available',
    confidence: 'measured',
    source: 'browser-geolocation',
    value: { lat: 46.8, lng: -71.2, accuracyMeters: 5, timestampMs: Date.now() },
  }),
}))
vi.mock('@/features/deertracker/components/DeerMiniMap', () => ({
  DeerMiniMap: ({ markers }: { markers?: { name: string }[] }) => (
    <ul aria-label="mini-carte">
      {markers?.map((m) => (
        <li key={m.name}>{m.name}</li>
      ))}
    </ul>
  ),
}))

beforeEach(async () => {
  navigate.mockReset()
  await Promise.all(db.tables.map((t) => t.clear()))
  useTracksStore.setState({
    tracks: [],
    loaded: false,
    status: 'idle',
    recordingId: null,
    points: [],
  })
  useWaypointsStore.setState({ waypoints: [], loaded: true })
  useBloodStore.setState({ sessions: [], loaded: true, manual: null, cameraOpen: false })
  useJournalStore.setState({ observations: [], loaded: true, editingId: null })
  useAddPointStore.setState({ open: false, type: 'normal', needsSearch: false })
})

function renderPage() {
  render(
    <MemoryRouter>
      <AfterShotPage />
    </MemoryRouter>,
  )
}

describe('Après le tir', () => {
  it('offers deer and moose and every action, and says the expert guide is still to be completed', () => {
    renderPage()
    expect(screen.getByRole('radio', { name: 'Cerf' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Orignal' })).toBeInTheDocument()
    for (const name of [
      'Consigner le tir',
      'Consigner les indices',
      'Démarrer une recherche',
      /Caméra sang/,
    ]) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
    expect(screen.getByTestId('last-clue')).toHaveTextContent('Aucun indice enregistré')
    expect(
      screen.getByText(/reste à compléter avec des sources vérifiables/),
    ).toBeVisible()
    expect(screen.getByText(/distinct/)).toBeVisible()
  })

  it('shows the guide structure as « Contenu à venir » : no unsourced advice', () => {
    renderPage()
    const guide = screen.getByTestId('aftershot-guide')
    expect(guide).toBeVisible()
    for (const node of screen.getAllByTestId('guide-pending')) {
      expect(node).toHaveTextContent('Contenu à venir — sources en vérification')
    }
  })

  it('records a shot with only what was entered and lists it with a timeline', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('radio', { name: 'Orignal' }))
    await user.click(screen.getByRole('button', { name: 'Consigner le tir' }))
    const form = screen.getByRole('form', { name: 'Consigner le tir' })
    await user.type(within(form).getByLabelText(/Réaction observée/), 'a sursauté')
    await user.selectOptions(
      within(form).getByLabelText('Direction de fuite observée'),
      '90',
    )
    await user.click(within(form).getByRole('button', { name: 'Enregistrer le tir' }))

    await waitFor(() => expect(useJournalStore.getState().observations).toHaveLength(1))
    const [entry] = useJournalStore.getState().observations
    expect(entry?.shot).toEqual({
      species: 'moose',
      reaction: 'a sursauté',
      fleeDirectionDegrees: 90,
    })
    expect(entry?.deer).toBeUndefined()
    expect(entry?.coordinate).toMatchObject({ lat: 46.8, lng: -71.2 })
    expect(entry?.positionOrigin).toBe('gps')
    expect(await db.observations.count()).toBe(1)
    expect(await screen.findByRole('list', { name: 'Chronologie' })).toHaveTextContent(
      'Tir',
    )
    expect(screen.getByText(/Orignal ·/)).toBeInTheDocument()
  })

  it('an estimated position is only stored when chosen, and is labelled manual', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Consigner le tir' }))
    const form = screen.getByRole('form', { name: 'Consigner le tir' })
    expect(within(form).getAllByText('Non renseignée.')).toHaveLength(2)
    await user.click(
      within(
        within(form).getByRole('radiogroup', { name: 'Origine de la position estimée' }),
      ).getByRole('radio', { name: /Centre de la carte/ }),
    )
    await user.click(within(form).getByRole('button', { name: 'Enregistrer le tir' }))
    await waitFor(() => expect(useJournalStore.getState().observations).toHaveLength(1))
    expect(
      useJournalStore.getState().observations[0]?.shot?.estimatedAnimalPosition,
    ).toBeDefined()
    expect(screen.getByText(/estimation manuelle/i)).toBeInTheDocument()
  })

  it('"Consigner les indices" opens « + Repère » on the blood type on the map', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Consigner les indices' }))
    expect(useAddPointStore.getState()).toMatchObject({ open: true, type: 'blood' })
    expect(navigate).toHaveBeenCalledWith('/map')
  })

  it('the blood camera opens from here without any search', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Caméra sang/ }))
    expect(useBloodStore.getState().cameraOpen).toBe(true)
    expect(useBloodStore.getState().sessions).toHaveLength(0)
    expect(navigate).toHaveBeenCalledWith('/map')
  })

  it('starts a search only on the explicit button and links the shot to it', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Consigner le tir' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer le tir' }))
    await waitFor(() => expect(useJournalStore.getState().observations).toHaveLength(1))
    expect(useBloodStore.getState().sessions).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Démarrer une recherche' }))
    await waitFor(() => expect(useBloodStore.getState().sessions).toHaveLength(1))
    const session = useBloodStore.getState().sessions[0]
    expect(session?.species).toBe('Cerf')
    await waitFor(() =>
      expect(useJournalStore.getState().observations[0]?.shot?.searchSessionId).toBe(
        session?.id,
      ),
    )
    expect(navigate).toHaveBeenCalledWith('/map')
  })

  it('with an open search the button resumes it instead of starting another', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPage()
    await user.click(
      screen.getByRole('button', { name: 'Reprendre la recherche en cours' }),
    )
    expect(useBloodStore.getState().sessions).toHaveLength(1)
    expect(navigate).toHaveBeenCalledWith('/map')
  })

  it('shows the last clue of the open search', async () => {
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    await useBloodStore.getState().addMarker('blood', {
      coordinate: { lat: 46.8, lng: -71.2, accuracyMeters: 4 },
      origin: 'gps',
    })
    renderPage()
    expect(await screen.findByTestId('last-clue')).toHaveTextContent('Sang 01')
  })
})
