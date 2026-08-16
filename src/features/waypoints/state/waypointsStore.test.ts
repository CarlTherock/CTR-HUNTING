import { afterEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useWaypointsStore } from './waypointsStore'

afterEach(async () => {
  await db.waypoints.clear()
  useWaypointsStore.setState({
    waypoints: [],
    loaded: false,
    isPlacing: false,
    editingId: null,
  })
})

describe('waypointsStore', () => {
  it('loads waypoints from Dexie', async () => {
    await db.waypoints.add({
      id: 'w1',
      name: 'Existing',
      coordinate: { lat: 1, lng: 1 },
      category: 'general',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    await useWaypointsStore.getState().load()

    expect(useWaypointsStore.getState().loaded).toBe(true)
    expect(useWaypointsStore.getState().waypoints).toHaveLength(1)
  })

  it('arms and cancels placing mode', () => {
    useWaypointsStore.getState().startPlacing()
    expect(useWaypointsStore.getState().isPlacing).toBe(true)

    useWaypointsStore.getState().cancelPlacing()
    expect(useWaypointsStore.getState().isPlacing).toBe(false)
  })

  it('placing a waypoint persists it, adds it to state, and opens it for editing', async () => {
    useWaypointsStore.getState().startPlacing()

    await useWaypointsStore.getState().placeWaypointAt({ lat: 46.8, lng: -71.2 })

    const state = useWaypointsStore.getState()
    expect(state.isPlacing).toBe(false)
    expect(state.waypoints).toHaveLength(1)
    expect(state.editingId).toBe(state.waypoints[0].id)
    expect(state.waypoints[0].category).toBe('general')

    const [persisted] = await db.waypoints.toArray()
    expect(persisted.id).toBe(state.waypoints[0].id)
  })

  it('clears isPlacing synchronously, so a near-simultaneous second tap (guarded by isPlacing, the way MapPage wires onMapClick) never creates a duplicate waypoint from one tap', async () => {
    useWaypointsStore.getState().startPlacing()

    // Mirrors MapPage's onMapClick: check isPlacing, then call
    // placeWaypointAt. Both "clicks" fire before either await resolves —
    // exactly the sequence a device can produce for one physical tap.
    const maybePlace = () => {
      if (useWaypointsStore.getState().isPlacing) {
        return useWaypointsStore.getState().placeWaypointAt({ lat: 46.8, lng: -71.2 })
      }
      return undefined
    }
    await Promise.all([maybePlace(), maybePlace()])

    expect(useWaypointsStore.getState().waypoints).toHaveLength(1)
    expect(await db.waypoints.count()).toBe(1)
  })

  it('updateWaypoint writes through to Dexie and updates state', async () => {
    await useWaypointsStore.getState().placeWaypointAt({ lat: 46.8, lng: -71.2 })
    const id = useWaypointsStore.getState().waypoints[0].id

    await useWaypointsStore.getState().updateWaypoint(id, { name: 'Renamed', category: 'water' })

    expect(useWaypointsStore.getState().waypoints[0].name).toBe('Renamed')
    const persisted = await db.waypoints.get(id)
    expect(persisted?.name).toBe('Renamed')
    expect(persisted?.category).toBe('water')
  })

  it('deleteWaypoint removes it from Dexie, state, and closes the editor if it was open', async () => {
    await useWaypointsStore.getState().placeWaypointAt({ lat: 46.8, lng: -71.2 })
    const id = useWaypointsStore.getState().waypoints[0].id

    await useWaypointsStore.getState().deleteWaypoint(id)

    expect(useWaypointsStore.getState().waypoints).toEqual([])
    expect(useWaypointsStore.getState().editingId).toBeNull()
    expect(await db.waypoints.get(id)).toBeUndefined()
  })
})
