import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { WaypointEditPanel } from '@/features/waypoints/components/WaypointEditPanel'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { MapInstance } from '@/services/map'
import type { Waypoint } from '@/types'
import { useGuidanceStore } from '../state/guidanceStore'
import { GuidancePanel } from './GuidancePanel'

/** The "Aller à" button of the saved-waypoint sheet, end to end with the
 * panel. GPS and compass are SIMULATED (synthetic readings). */
vi.mock('@/services/geomagnetic', () => ({
  getDeclination: vi.fn().mockResolvedValue(-15),
}))

const WAYPOINT: Waypoint = {
  id: 'w1',
  name: 'Mirador nord',
  coordinate: { lat: 46.813894, lng: -71.208 },
  category: 'stand_blind',
  notes: 'NOTE-PRIVEE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const GPS: GeolocationReading = {
  status: 'available',
  value: { lat: 46.8, lng: -71.2, accuracyMeters: 8, timestampMs: Date.now() },
  confidence: 'measured',
  source: 'browser-geolocation',
}
const DENIED: GeolocationReading = {
  status: 'unavailable',
  kind: 'denied',
  reason: 'Autorisation de localisation refusée.',
}

const mapMock = { setGuidanceLine: vi.fn(), setUserHeading: vi.fn() }
const getMapInstance = () => mapMock as unknown as MapInstance

function Harness({ gps }: { gps: GeolocationReading }) {
  return (
    <>
      <WaypointEditPanel gpsReading={gps} />
      <GuidancePanel gpsReading={gps} getMapInstance={getMapInstance} />
    </>
  )
}

const RESET_TRACKS = {
  tracks: [],
  loaded: false,
  status: 'idle' as const,
  recordingId: null,
  recordingStartedAt: null,
  points: [],
  distanceMeters: 0,
  persistError: null,
}

beforeEach(async () => {
  vi.stubGlobal('DeviceOrientationEvent', () => undefined)
  await db.waypoints.add(WAYPOINT)
  useWaypointsStore.setState({
    waypoints: [WAYPOINT],
    loaded: true,
    editingId: 'w1',
    draft: null,
  })
  useGuidanceStore.setState({ destinationId: null, collapsed: false, notice: null })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  useGuidanceStore.setState({ destinationId: null, collapsed: false, notice: null })
  useWaypointsStore.setState({ waypoints: [], editingId: null, draft: null })
  useTracksStore.setState(RESET_TRACKS)
  await db.waypoints.clear()
  await db.tracks.clear()
})

describe('"Aller à" from the saved waypoint sheet', () => {
  it('has a 44 px "Aller à" button that opens the guidance and closes the sheet', async () => {
    const user = userEvent.setup()
    render(<Harness gps={GPS} />)

    const button = screen.getByRole('button', { name: 'Aller à' })
    expect(button.className).toMatch(/h-11/)
    expect(screen.getByRole('heading', { name: 'Point de repère' })).toBeInTheDocument()

    await user.click(button)

    expect(useGuidanceStore.getState().destinationId).toBe('w1')
    expect(useWaypointsStore.getState().editingId).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Point de repère' })).toBeNull()
    expect(screen.getByTestId('guidance-title')).toHaveTextContent(
      'Aller à : Mirador nord',
    )
    expect(screen.getByTestId('guidance-distance')).toBeInTheDocument()
  })

  it('does not modify the waypoint and creates no track', async () => {
    const user = userEvent.setup()
    const before = JSON.stringify(await db.waypoints.toArray())
    render(<Harness gps={GPS} />)

    await user.click(screen.getByRole('button', { name: 'Aller à' }))
    await user.click(screen.getByRole('button', { name: 'Réduire' }))
    await user.click(screen.getByRole('button', { name: 'Arrêter le guidage' }))

    expect(JSON.stringify(await db.waypoints.toArray())).toBe(before)
    expect(await db.tracks.count()).toBe(0)
    expect(useTracksStore.getState().status).toBe('idle')
  })

  it('does not start or stop a recording, in either direction', async () => {
    const user = userEvent.setup()
    await useTracksStore.getState().start()
    const recordingId = useTracksStore.getState().recordingId
    render(<Harness gps={GPS} />)

    await user.click(screen.getByRole('button', { name: 'Aller à' }))
    expect(useTracksStore.getState().status).toBe('recording')

    await user.click(screen.getByRole('button', { name: 'Arrêter le guidage' }))
    expect(useTracksStore.getState().status).toBe('recording')
    expect(useTracksStore.getState().recordingId).toBe(recordingId)
    expect(await db.tracks.count()).toBe(1)
  })

  it('has no "Aller à" for a waypoint being created (nothing saved yet)', () => {
    useWaypointsStore.setState({
      editingId: null,
      draft: { coordinate: { lat: 46.8, lng: -71.2 }, saving: false, error: null },
    })
    render(<Harness gps={GPS} />)
    expect(screen.queryByRole('button', { name: 'Aller à' })).toBeNull()
  })

  it('with the GPS denied: the reason is shown, no distance, and the waypoint can still be viewed', async () => {
    const user = userEvent.setup()
    render(<Harness gps={DENIED} />)
    await user.click(screen.getByRole('button', { name: 'Aller à' }))

    expect(screen.getByTestId('guidance-unavailable')).toHaveTextContent(
      'Autorisation de localisation refusée.',
    )
    expect(screen.queryByTestId('guidance-distance')).toBeNull()

    // Reopen the sheet while guiding: coordinates and sharing stay available.
    useWaypointsStore.getState().selectWaypoint('w1')
    expect(await screen.findByTestId('waypoint-position')).toBeInTheDocument()
    expect(screen.getByTestId('waypoint-latitude')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copier le texte/ })).toBeInTheDocument()
  })
})
