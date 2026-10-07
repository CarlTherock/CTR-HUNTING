import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '@/database/db'
import { listTracks } from '@/database/tracksRepository'
import { listWaypoints } from '@/database/waypointsRepository'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { Waypoint } from '@/types'
import { useGuidanceDestination, useGuidanceStore } from './guidanceStore'

const WAYPOINT: Waypoint = {
  id: 'w1',
  name: 'Mirador nord',
  coordinate: { lat: 46.813894, lng: -71.208 },
  category: 'stand_blind',
  notes: 'NOTE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const OTHER: Waypoint = { ...WAYPOINT, id: 'w2', name: 'Autre' }

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
  await db.waypoints.bulkAdd([WAYPOINT, OTHER])
  useWaypointsStore.setState({ waypoints: [WAYPOINT, OTHER], loaded: true })
  useGuidanceStore.setState({ destinationId: null, collapsed: false, notice: null })
})

afterEach(async () => {
  useGuidanceStore.setState({ destinationId: null, collapsed: false, notice: null })
  useWaypointsStore.setState({ waypoints: [], editingId: null })
  useTracksStore.setState(RESET_TRACKS)
  await db.waypoints.clear()
  await db.tracks.clear()
})

describe('guidanceStore', () => {
  it('starts on a saved waypoint (id only) and stops', () => {
    expect(useGuidanceStore.getState().start('w1')).toBe(true)
    expect(useGuidanceStore.getState().destinationId).toBe('w1')
    expect(useGuidanceStore.getState().collapsed).toBe(false)

    useGuidanceStore.getState().setCollapsed(true)
    expect(useGuidanceStore.getState().collapsed).toBe(true)

    useGuidanceStore.getState().stop()
    expect(useGuidanceStore.getState().destinationId).toBeNull()
    expect(useGuidanceStore.getState().collapsed).toBe(false)
  })

  it('stores nothing but the id: no coordinate is copied into the guidance state', () => {
    useGuidanceStore.getState().start('w1')
    expect(JSON.stringify(useGuidanceStore.getState())).not.toContain('46.8138')
  })

  it('refuses an unknown waypoint with a visible notice', () => {
    expect(useGuidanceStore.getState().start('nope')).toBe(false)
    expect(useGuidanceStore.getState().destinationId).toBeNull()
    expect(useGuidanceStore.getState().notice).toMatch(/introuvable/)
  })

  it('refuses a waypoint without a valid position', () => {
    useWaypointsStore.setState({
      waypoints: [{ ...WAYPOINT, id: 'bad', coordinate: { lat: Number.NaN, lng: 0 } }],
    })
    expect(useGuidanceStore.getState().start('bad')).toBe(false)
    expect(useGuidanceStore.getState().notice).not.toBeNull()
  })

  it('switching destination replaces the previous one and clears an old notice', () => {
    useGuidanceStore.setState({ notice: 'ancien message' })
    useGuidanceStore.getState().start('w1')
    useGuidanceStore.getState().start('w2')
    expect(useGuidanceStore.getState().destinationId).toBe('w2')
    expect(useGuidanceStore.getState().notice).toBeNull()
  })

  it('stops itself with a visible notice when its waypoint disappears', () => {
    useGuidanceStore.getState().start('w1')

    act(() => {
      useWaypointsStore.setState({ waypoints: [OTHER] })
    })

    expect(useGuidanceStore.getState().destinationId).toBeNull()
    expect(useGuidanceStore.getState().notice).toContain('Mirador nord')
    expect(useGuidanceStore.getState().notice).toMatch(/supprimé/)
  })

  it('keeps guiding when another waypoint is removed', () => {
    useGuidanceStore.getState().start('w1')
    act(() => {
      useWaypointsStore.setState({ waypoints: [WAYPOINT] })
    })
    expect(useGuidanceStore.getState().destinationId).toBe('w1')
    expect(useGuidanceStore.getState().notice).toBeNull()
  })

  it('reads the destination live from the waypoints store (a rename shows, nothing is copied)', () => {
    useGuidanceStore.getState().start('w1')
    const { result } = renderHook(() => useGuidanceDestination())
    expect(result.current?.name).toBe('Mirador nord')

    act(() => {
      useWaypointsStore.setState({
        waypoints: [{ ...WAYPOINT, name: 'Renommé' }, OTHER],
      })
    })
    expect(result.current?.name).toBe('Renommé')
    expect(result.current?.coordinate).toEqual(WAYPOINT.coordinate)
  })

  it('is not persisted anywhere', () => {
    useGuidanceStore.getState().start('w1')
    expect(JSON.stringify({ ...localStorage })).not.toContain('w1')
  })
})

describe('guidance never writes waypoints or tracks', () => {
  it('leaves the waypoint records byte-identical and creates no track', async () => {
    const before = JSON.stringify(await listWaypoints())

    useGuidanceStore.getState().start('w1')
    useGuidanceStore.getState().setCollapsed(true)
    useGuidanceStore.getState().stop()
    useGuidanceStore.getState().start('w2')

    expect(JSON.stringify(await listWaypoints())).toBe(before)
    expect(await listTracks()).toEqual([])
    expect(useTracksStore.getState().status).toBe('idle')
  })

  it('coexists with a recording: starting/stopping guidance does not start or stop it, and vice versa', async () => {
    await useTracksStore.getState().start()
    const recordingId = useTracksStore.getState().recordingId
    expect(useTracksStore.getState().status).toBe('recording')

    useGuidanceStore.getState().start('w1')
    expect(useTracksStore.getState().status).toBe('recording')
    expect(useTracksStore.getState().recordingId).toBe(recordingId)

    await useTracksStore.getState().stop()
    expect(useTracksStore.getState().status).toBe('idle')
    expect(useGuidanceStore.getState().destinationId).toBe('w1')

    await useTracksStore.getState().start()
    useGuidanceStore.getState().stop()
    expect(useTracksStore.getState().status).toBe('recording')
    expect((await listTracks()).length).toBe(2) // only the two explicit recordings
  })
})
