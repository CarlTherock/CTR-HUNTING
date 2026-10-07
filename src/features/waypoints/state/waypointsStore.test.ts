import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { WaypointLockedError } from '@/database/waypointsRepository'
import { useWaypointsStore } from './waypointsStore'
import type { WaypointFields } from './waypointsStore'
import type { Waypoint } from '@/types'

const FIELDS: WaypointFields = {
  name: 'Poste du ruisseau',
  category: 'stand_blind',
  color: '#3b82f6',
  notes: 'Vent du nord',
  optimalWindDirections: [0, 45],
}
const HERE = { lat: 46.8, lng: -71.2 }

function resetStore() {
  useWaypointsStore.setState({
    waypoints: [],
    loaded: false,
    isPlacing: false,
    draft: null,
    editingId: null,
  })
}

afterEach(async () => {
  vi.restoreAllMocks()
  await db.waypoints.clear()
  resetStore()
})

function startDraftAt(coordinate = HERE) {
  useWaypointsStore.getState().startPlacing()
  useWaypointsStore.getState().placeWaypointAt(coordinate)
}

/** A waypoint saved before the lock rule existed (same stored shape). */
const LEGACY: Waypoint = {
  id: 'legacy',
  name: 'Ancien point',
  coordinate: { lat: 46.5, lng: -71.5 },
  category: 'general',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('waypointsStore — loading and placing', () => {
  it('loads waypoints from Dexie', async () => {
    await db.waypoints.add(LEGACY)
    await useWaypointsStore.getState().load()

    expect(useWaypointsStore.getState().loaded).toBe(true)
    expect(useWaypointsStore.getState().waypoints).toEqual([LEGACY])
  })

  it('arms and cancels placing mode', () => {
    useWaypointsStore.getState().startPlacing()
    expect(useWaypointsStore.getState().isPlacing).toBe(true)

    useWaypointsStore.getState().cancelPlacing()
    expect(useWaypointsStore.getState().isPlacing).toBe(false)
  })

  it('placing only opens an in-memory draft: nothing is written until Save', async () => {
    startDraftAt()

    const state = useWaypointsStore.getState()
    expect(state.isPlacing).toBe(false)
    expect(state.draft).toEqual({ coordinate: HERE, saving: false, error: null })
    expect(state.waypoints).toEqual([])
    expect(await db.waypoints.count()).toBe(0)
  })

  it('ignores a placement that was not armed, and a second tap for the same placement', () => {
    useWaypointsStore.getState().placeWaypointAt(HERE)
    expect(useWaypointsStore.getState().draft).toBeNull()

    startDraftAt(HERE)
    useWaypointsStore.getState().placeWaypointAt({ lat: 1, lng: 1 }) // the duplicate tap
    expect(useWaypointsStore.getState().draft?.coordinate).toEqual(HERE)
  })
})

describe('waypointsStore — draft, Save and cancel', () => {
  it('Save creates the waypoint at the draft coordinate with all its metadata', async () => {
    startDraftAt({ lat: 46.81234, lng: -71.20987 })

    const saved = await useWaypointsStore.getState().saveDraft(FIELDS)

    expect(saved).toBe(true)
    const state = useWaypointsStore.getState()
    expect(state.draft).toBeNull()
    expect(state.waypoints).toHaveLength(1)
    const [persisted] = await db.waypoints.toArray()
    expect(persisted).toMatchObject({
      ...FIELDS,
      coordinate: { lat: 46.81234, lng: -71.20987 },
    })
    expect(state.waypoints[0]).toEqual(persisted)
  })

  it('the position stays adjustable before Save, and Save uses the adjusted one', async () => {
    startDraftAt(HERE)
    useWaypointsStore.getState().moveDraft({ lat: 46.9, lng: -71.1 })

    await useWaypointsStore.getState().saveDraft(FIELDS)

    expect((await db.waypoints.toArray())[0].coordinate).toEqual({
      lat: 46.9,
      lng: -71.1,
    })
  })

  it('cancelling a creation leaves no ghost waypoint anywhere', async () => {
    startDraftAt()

    useWaypointsStore.getState().cancelDraft()

    expect(useWaypointsStore.getState().draft).toBeNull()
    expect(useWaypointsStore.getState().waypoints).toEqual([])
    expect(await db.waypoints.count()).toBe(0)
  })

  it('a failed save keeps the draft open with a visible error, and retrying creates exactly one waypoint', async () => {
    startDraftAt()
    const add = vi
      .spyOn(db.waypoints, 'add')
      .mockRejectedValueOnce(new Error('disque plein'))

    expect(await useWaypointsStore.getState().saveDraft(FIELDS)).toBe(false)

    const afterFailure = useWaypointsStore.getState()
    expect(afterFailure.draft?.error).toContain('disque plein')
    expect(afterFailure.draft?.saving).toBe(false)
    expect(afterFailure.draft?.coordinate).toEqual(HERE)
    expect(afterFailure.waypoints).toEqual([])
    expect(await db.waypoints.count()).toBe(0)

    add.mockRestore()
    expect(await useWaypointsStore.getState().saveDraft(FIELDS)).toBe(true)
    expect(await db.waypoints.count()).toBe(1)
  })

  it('does not move a draft while it is being saved', async () => {
    startDraftAt()
    const pending = useWaypointsStore.getState().saveDraft(FIELDS)
    useWaypointsStore.getState().moveDraft({ lat: 0, lng: 0 })
    await pending

    expect((await db.waypoints.toArray())[0].coordinate).toEqual(HERE)
  })
})

describe('waypointsStore — saved waypoints are locked in place', () => {
  async function saveOne() {
    startDraftAt()
    await useWaypointsStore.getState().saveDraft(FIELDS)
    return useWaypointsStore.getState().waypoints[0]
  }

  it('editing metadata never changes the coordinate', async () => {
    const saved = await saveOne()

    await useWaypointsStore.getState().updateWaypoint(saved.id, {
      name: 'Renommé',
      category: 'water',
      color: '#22c55e',
      notes: 'autre note',
      optimalWindDirections: [180],
    })

    const persisted = await db.waypoints.get(saved.id)
    expect(persisted?.coordinate).toEqual(HERE)
    expect(persisted?.name).toBe('Renommé')
    expect(useWaypointsStore.getState().waypoints[0].coordinate).toEqual(HERE)
  })

  it('rejects any attempt to change the coordinate (even bypassing the types), leaving it intact', async () => {
    const saved = await saveOne()
    const attempt = { coordinate: { lat: 10, lng: 10 } } as unknown as { name: string }

    await expect(
      useWaypointsStore.getState().updateWaypoint(saved.id, attempt),
    ).rejects.toBeInstanceOf(WaypointLockedError)

    expect((await db.waypoints.get(saved.id))?.coordinate).toEqual(HERE)
    expect(useWaypointsStore.getState().waypoints[0].coordinate).toEqual(HERE)
  })

  it('selecting a saved waypoint and moving a draft never touches it', async () => {
    const saved = await saveOne()

    useWaypointsStore.getState().selectWaypoint(saved.id)
    useWaypointsStore.getState().moveDraft({ lat: 5, lng: 5 }) // no draft: no-op

    expect((await db.waypoints.get(saved.id))?.coordinate).toEqual(HERE)
  })

  it('keeps the exact coordinate after a reload from the device', async () => {
    startDraftAt({ lat: 46.123456789, lng: -71.987654321 })
    await useWaypointsStore.getState().saveDraft(FIELDS)

    resetStore()
    await useWaypointsStore.getState().load()

    expect(useWaypointsStore.getState().waypoints[0].coordinate).toEqual({
      lat: 46.123456789,
      lng: -71.987654321,
    })
  })

  it('protects waypoints saved before the rule existed: same coordinates, locked, metadata editable', async () => {
    await db.waypoints.add(LEGACY)
    await useWaypointsStore.getState().load()

    await expect(
      useWaypointsStore
        .getState()
        .updateWaypoint('legacy', { coordinate: { lat: 0, lng: 0 } } as unknown as {
          name: string
        }),
    ).rejects.toBeInstanceOf(WaypointLockedError)
    await useWaypointsStore.getState().updateWaypoint('legacy', { notes: 'ajout' })

    const persisted = await db.waypoints.get('legacy')
    expect(persisted?.coordinate).toEqual(LEGACY.coordinate)
    expect(persisted?.notes).toBe('ajout')
  })

  it('moving a waypoint means deleting it and creating a new one elsewhere', async () => {
    const first = await saveOne()

    await useWaypointsStore.getState().deleteWaypoint(first.id)
    expect(await db.waypoints.count()).toBe(0)

    startDraftAt({ lat: 47, lng: -72 })
    await useWaypointsStore.getState().saveDraft({ ...FIELDS, name: 'Nouveau lieu' })

    const all = await db.waypoints.toArray()
    expect(all).toHaveLength(1)
    expect(all[0].id).not.toBe(first.id)
    expect(all[0].coordinate).toEqual({ lat: 47, lng: -72 })
  })

  it('deleteWaypoint closes the editor if it was open for that waypoint', async () => {
    const saved = await saveOne()
    useWaypointsStore.getState().selectWaypoint(saved.id)

    await useWaypointsStore.getState().deleteWaypoint(saved.id)

    expect(useWaypointsStore.getState().editingId).toBeNull()
    expect(await db.waypoints.get(saved.id)).toBeUndefined()
  })
})

describe('startDraftAt (point received through a shared link)', () => {
  it('opens a new draft with a pre-filled name and writes nothing', async () => {
    useWaypointsStore.getState().startDraftAt(HERE, 'Mirador')

    expect(useWaypointsStore.getState().draft).toEqual({
      coordinate: HERE,
      saving: false,
      error: null,
      initialName: 'Mirador',
    })
    expect(await db.waypoints.count()).toBe(0)
  })

  it('saving creates a NEW waypoint and leaves the existing ones untouched', async () => {
    const existing = await db.waypoints.put({
      ...LEGACY,
      id: 'keep',
      name: 'Existant',
    })
    expect(existing).toBe('keep')
    await useWaypointsStore.getState().load()

    useWaypointsStore.getState().startDraftAt(HERE, 'Mirador')
    await useWaypointsStore.getState().saveDraft({ ...FIELDS, name: 'Mirador' })

    const all = await db.waypoints.toArray()
    expect(all).toHaveLength(2)
    expect(all.find((w) => w.id === 'keep')).toMatchObject({ name: 'Existant' })
    expect(all.find((w) => w.id !== 'keep')).toMatchObject({
      name: 'Mirador',
      coordinate: HERE,
    })
  })
})
