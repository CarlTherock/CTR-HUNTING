/* eslint-disable @typescript-eslint/no-non-null-assertion -- test code asserts presence right before use */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useBloodStore } from '../state/bloodStore'
import { BloodPanel } from './BloodPanel'

const fix = (
  overrides: Partial<{ accuracy: number; ageMs: number }> = {},
): GeolocationReading => ({
  status: 'available',
  confidence: 'measured',
  source: 'browser-geolocation',
  value: {
    lat: 46.8,
    lng: -71.2,
    accuracyMeters: overrides.accuracy ?? 5,
    timestampMs: Date.now() - (overrides.ageMs ?? 500),
  },
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

function renderPanel(reading: GeolocationReading) {
  const onCenter = vi.fn()
  const onOverview = vi.fn()
  render(<BloodPanel gpsReading={reading} onCenter={onCenter} onOverview={onOverview} />)
  return { onCenter, onOverview }
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  useTracksStore.setState(TRACKS_RESET)
  useWaypointsStore.setState({ waypoints: [], loaded: true })
  useBloodStore.setState({
    sessions: [],
    loaded: true,
    lastAddedId: null,
    showLinks: false,
    manual: null,
  })
  useGuidanceStore.setState({ destinationId: null, notice: null })
})
afterEach(() => vi.restoreAllMocks())

describe('BloodPanel', () => {
  it('renders nothing without an open session', () => {
    renderPanel(fix())
    expect(screen.queryByTestId('blood-panel')).not.toBeInTheDocument()
  })

  it('+ Sang creates one real waypoint per press and confirms only after the write', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPanel(fix())

    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    await waitFor(() =>
      expect(screen.getByText('Sang 01 enregistré.')).toBeInTheDocument(),
    )
    expect(await db.waypoints.count()).toBe(1)

    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    await waitFor(() =>
      expect(screen.getByText('Sang 02 enregistré.')).toBeInTheDocument(),
    )
    expect((await db.waypoints.toArray()).map((w) => w.name).sort()).toEqual([
      'Sang 01',
      'Sang 02',
    ])
  })

  it('flags a low-accuracy position instead of hiding it', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPanel(fix({ accuracy: 60 }))
    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    await waitFor(() =>
      expect(screen.getByText(/précision faible \(±60 m\)/)).toBeInTheDocument(),
    )
  })

  it('shows a clear failure and keeps nothing when the write fails', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPanel(fix())
    const proto = Object.getPrototypeOf(db.waypoints) as {
      add: (...args: unknown[]) => Promise<unknown>
    }
    const original = proto.add
    proto.add = () => Promise.reject(new Error('plein'))
    try {
      await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(/non enregistré/),
      )
    } finally {
      proto.add = original
    }
    expect(screen.queryByText(/enregistré\.$/)).not.toBeInTheDocument()
    expect(await db.waypoints.count()).toBe(0)
  })

  it('without a GPS position: offers to wait or place by hand, and never uses the map centre', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPanel(NO_GPS)
    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Position GPS indisponible/)
    expect(await db.waypoints.count()).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Placer à la main' }))
    expect(screen.getByRole('group', { name: 'Placement manuel' })).toHaveTextContent(
      /pas celle du téléphone/,
    )
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    useBloodStore.getState().setManualCoordinate({ lat: 46.81, lng: -71.21 })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(screen.getByText(/placé à la main/)).toBeInTheDocument())
    expect((await db.waypoints.toArray())[0]).toMatchObject({ origin: 'manual' })
  })

  it('refuses a stale GPS fix', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPanel(fix({ ageMs: 10 * 60_000 }))
    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/trop ancienne/)
    expect(await db.waypoints.count()).toBe(0)
  })

  it('waits for the GPS, records nothing, can be cancelled, and starts on the first usable fix', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: false })
    const view = render(
      <BloodPanel gpsReading={NO_GPS} onCenter={vi.fn()} onOverview={vi.fn()} />,
    )
    expect(screen.getByTestId('blood-status')).toHaveTextContent('En attente du GPS')
    expect(screen.getByText(/aucun point n’est enregistré/)).toBeInTheDocument()
    expect(useTracksStore.getState().status).toBe('idle')

    view.rerender(
      <BloodPanel gpsReading={fix()} onCenter={vi.fn()} onOverview={vi.fn()} />,
    )
    await waitFor(() => expect(useTracksStore.getState().status).toBe('recording'))
    expect(screen.getByTestId('blood-status')).toHaveTextContent('En cours')
    await user.click(screen.getByRole('button', { name: 'Terminer la recherche' }))
    await waitFor(() =>
      expect(screen.queryByTestId('blood-panel')).not.toBeInTheDocument(),
    )
  })

  it('cancelling while waiting removes the session', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: false })
    renderPanel(NO_GPS)
    await user.click(screen.getByRole('button', { name: 'Annuler la recherche' }))
    await waitFor(() =>
      expect(screen.queryByTestId('blood-panel')).not.toBeInTheDocument(),
    )
    expect(await db.bloodSessions.count()).toBe(0)
  })

  it('pause becomes Reprendre', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPanel(fix())
    await user.click(screen.getByRole('button', { name: 'Mettre la recherche en pause' }))
    await waitFor(() =>
      expect(screen.getByTestId('blood-status')).toHaveTextContent('En pause'),
    )
    await user.click(screen.getByRole('button', { name: 'Reprendre la recherche' }))
    await waitFor(() =>
      expect(screen.getByTestId('blood-status')).toHaveTextContent('En cours'),
    )
  })

  it('proposes to resume or finish an interrupted search and never restarts it by itself', async () => {
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    await useTracksStore.getState().flush()
    useTracksStore.setState(TRACKS_RESET) // « app closed »
    renderPanel(fix())
    expect(screen.getByRole('alert')).toHaveTextContent(/interrompue/)
    expect(useTracksStore.getState().status).toBe('idle')
    expect(
      screen.getByRole('button', { name: 'Reprendre la recherche' }),
    ).toBeInTheDocument()
  })

  it('last blood / last clue shortcuts use Aller à; recenter and overview are wired', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    const { onCenter, onOverview } = renderPanel(fix())
    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    await waitFor(() => screen.getByText('Sang 01 enregistré.'))
    await user.click(screen.getByRole('button', { name: /Indices et outils/ }))
    // Last clue is the last blood: only one shortcut is active.
    expect(screen.getByRole('button', { name: /Aller au dernier indice/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Revenir au dernier sang/ }))
    const [waypoint] = await db.waypoints.toArray()
    expect(useGuidanceStore.getState().destinationId).toBe(waypoint.id)

    await user.click(screen.getByRole('button', { name: /Autre indice/ }))
    await waitFor(() => screen.getByText('Autre indice 01 enregistré.'))
    expect(screen.getByRole('button', { name: /Aller au dernier indice/ })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /Recentrer/ }))
    expect(onCenter).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Vue d’ensemble/ }))
    expect(onOverview).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Object)]))
  })

  it('undo deletes only the last clue, after a warning when it has a note', async () => {
    const user = userEvent.setup()
    await useBloodStore.getState().startSession({ hasUsableFix: true })
    renderPanel(fix())
    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    await waitFor(() => screen.getByText('Sang 01 enregistré.'))
    await user.click(screen.getByRole('button', { name: /\+ Sang/ }))
    await waitFor(() => screen.getByText('Sang 02 enregistré.'))
    const last = useWaypointsStore.getState().waypoints.at(-1)!
    await useWaypointsStore.getState().updateWaypoint(last.id, { notes: 'goutte large' })

    await user.click(screen.getByRole('button', { name: /Indices et outils/ }))
    await user.click(screen.getByRole('button', { name: /Annuler le dernier ajout/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/note ou une photo/)
    expect(await db.waypoints.count()).toBe(2)
    await user.click(screen.getByRole('button', { name: 'Supprimer quand même' }))
    await waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    expect((await db.waypoints.toArray())[0].name).toBe('Sang 01')
  })
})
