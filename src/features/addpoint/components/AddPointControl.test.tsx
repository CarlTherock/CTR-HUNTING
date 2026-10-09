import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useAddPointStore } from '../state/addPointStore'
import { AddPointControl } from './AddPointControl'

const fix = (): GeolocationReading => ({
  status: 'available',
  confidence: 'measured',
  source: 'browser-geolocation',
  value: { lat: 46.8, lng: -71.2, accuracyMeters: 6, timestampMs: Date.now() - 500 },
})
const NO_GPS: GeolocationReading = {
  status: 'unavailable',
  kind: 'searching',
  reason: 'x',
}

const TRACKS_RESET = {
  tracks: [],
  loaded: false,
  status: 'idle' as const,
  recordingId: null,
  recordingStartedAt: null,
  points: [],
  breaks: [],
  recordingKind: 'normal' as const,
  recordingSessionId: null,
  distanceMeters: 0,
  persistError: null,
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  useTracksStore.setState(TRACKS_RESET)
  useWaypointsStore.setState({
    waypoints: [],
    loaded: true,
    isPlacing: false,
    draft: null,
  })
  useBloodStore.setState({
    sessions: [],
    loaded: true,
    lastAddedId: null,
    manual: null,
    cameraOpen: false,
  })
  useJournalStore.setState({ observations: [], loaded: true, editingId: null })
  useAddPointStore.setState({
    open: false,
    type: 'normal',
    mode: 'gps',
    bloodKind: 'blood',
    note: '',
    picking: null,
    pressed: null,
    needsSearch: false,
    error: null,
    notice: null,
  })
})
afterEach(() => useBloodStore.getState().closeCamera())

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Ajouter un repère' }))
}

describe('AddPointControl (« + Repère »)', () => {
  it('is a labelled permanent button whose panel offers the five types', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={fix()} />)
    expect(screen.getByTestId('add-point-button')).toHaveTextContent('Repère')
    await openSheet(user)
    for (const name of [
      'Repère normal',
      'Sang / indice',
      'Observation cerf',
      'Observation orignal',
      'Caméra sang',
    ]) {
      expect(screen.getByRole('radio', { name: new RegExp(name) })).toBeInTheDocument()
    }
    expect(screen.getByTestId('add-point-gps-line')).toHaveTextContent('±6 m')
  })

  it('normal waypoint + GPS opens an adjustable draft at the real fix', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={fix()} />)
    await openSheet(user)
    await user.click(screen.getByRole('button', { name: 'Créer le repère ici' }))
    expect(useWaypointsStore.getState().draft?.coordinate).toMatchObject({
      lat: 46.8,
      lng: -71.2,
    })
    expect(screen.queryByTestId('add-point-sheet')).not.toBeInTheDocument()
  })

  it('without GPS, GPS mode explains why and invents no position; map mode arms placing', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={NO_GPS} />)
    await openSheet(user)
    await user.click(screen.getByRole('button', { name: 'Créer le repère ici' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Position GPS indisponible')
    expect(useWaypointsStore.getState().draft).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Position sur la carte' }))
    await user.click(screen.getByRole('button', { name: 'Choisir sur la carte' }))
    expect(useWaypointsStore.getState().isPlacing).toBe(true)
  })

  it('switching type keeps what was typed', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={fix()} />)
    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Sang \/ indice/ }))
    await user.type(screen.getByLabelText('Note (facultative)'), 'goutte sur la mousse')
    await user.click(screen.getByRole('radio', { name: /Observation cerf/ }))
    expect(screen.getByLabelText('Note (facultative)')).toHaveValue(
      'goutte sur la mousse',
    )
    await user.click(screen.getByRole('radio', { name: /Repère normal/ }))
    await user.click(screen.getByRole('radio', { name: /Sang \/ indice/ }))
    expect(screen.getByLabelText('Note (facultative)')).toHaveValue(
      'goutte sur la mousse',
    )
  })

  it('blood clue without an open search asks first; nothing starts silently', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={fix()} />)
    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Sang \/ indice/ }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’indice ici' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(useBloodStore.getState().sessions).toHaveLength(0)
    expect(useTracksStore.getState().status).toBe('idle')

    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(useBloodStore.getState().sessions).toHaveLength(0)
  })

  it('blood clue after "Créer une recherche et enregistrer" is one typed waypoint with its note', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={fix()} />)
    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Sang \/ indice/ }))
    await user.type(screen.getByLabelText('Note (facultative)'), 'départ de piste')
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’indice ici' }))
    await user.click(
      screen.getByRole('button', { name: 'Créer une recherche et enregistrer' }),
    )

    await waitFor(() => expect(useWaypointsStore.getState().waypoints).toHaveLength(1))
    const [clue] = useWaypointsStore.getState().waypoints
    expect(clue).toMatchObject({ bloodKind: 'blood', origin: 'gps' })
    expect(clue?.sessionId).toBe(useBloodStore.getState().openSession()?.id)
    await waitFor(() =>
      expect(useWaypointsStore.getState().waypoints[0]?.notes).toBe('départ de piste'),
    )
  })

  it('with an open search the blood clue goes through the same engine as « + Sang »', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    render(<AddPointControl gpsReading={fix()} />)
    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Sang \/ indice/ }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’indice ici' }))
    await waitFor(() => expect(useWaypointsStore.getState().waypoints).toHaveLength(1))
    expect(useBloodStore.getState().openSession()?.counters.blood).toBe(1)
    expect(await db.waypoints.count()).toBe(1)
  })

  it('long press opens the same panel with the pressed point as the position', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={NO_GPS} />)
    useAddPointStore.getState().openSheetAt({ lat: 46.9, lng: -71.3 })
    expect(await screen.findByTestId('add-point-gps-line')).toHaveTextContent('46.90000')
    await user.click(screen.getByRole('button', { name: 'Créer le repère ici' }))
    expect(useWaypointsStore.getState().draft?.coordinate).toEqual({
      lat: 46.9,
      lng: -71.3,
    })
  })

  it('deer observation at the GPS position lands in DeerTracker; moose does not', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={fix()} />)
    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Observation cerf/ }))
    await user.click(
      screen.getByRole('button', { name: 'Enregistrer l’observation ici' }),
    )
    await waitFor(() => expect(useJournalStore.getState().observations).toHaveLength(1))
    expect(useJournalStore.getState().observations[0]).toMatchObject({
      deer: { kind: 'sighting' },
      positionOrigin: 'gps',
    })

    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Observation orignal/ }))
    await user.click(
      screen.getByRole('button', { name: 'Enregistrer l’observation ici' }),
    )
    await waitFor(() => expect(useJournalStore.getState().observations).toHaveLength(2))
    const moose = useJournalStore.getState().observations[1]
    expect(moose?.species).toBe('moose')
    expect(moose?.deer).toBeUndefined()
    expect(await db.observations.count()).toBe(2)
  })

  it('animal observation on the map waits for a tap, then saves it as placed by hand', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={NO_GPS} />)
    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Observation cerf/ }))
    await user.click(screen.getByRole('radio', { name: 'Position sur la carte' }))
    await user.click(screen.getByRole('button', { name: 'Choisir sur la carte' }))
    expect(
      screen.getByText(/Touchez la carte : place de l’observation/),
    ).toBeInTheDocument()

    await useAddPointStore.getState().completePicking({ lat: 46.7, lng: -71.1 })
    await waitFor(() => expect(useJournalStore.getState().observations).toHaveLength(1))
    expect(useJournalStore.getState().observations[0]).toMatchObject({
      coordinate: { lat: 46.7, lng: -71.1 },
      positionOrigin: 'manual',
    })
  })

  it('Caméra sang opens the camera without any search and without a position', async () => {
    const user = userEvent.setup()
    render(<AddPointControl gpsReading={NO_GPS} />)
    await openSheet(user)
    await user.click(screen.getByRole('radio', { name: /Caméra sang/ }))
    expect(screen.queryByTestId('add-point-gps-line')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ouvrir la caméra sang' }))
    expect(useBloodStore.getState().cameraOpen).toBe(true)
    expect(useBloodStore.getState().sessions).toHaveLength(0)
  })
})
