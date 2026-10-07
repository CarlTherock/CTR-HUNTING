import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { getSetting } from '@/database/settingsRepository'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { getActiveTerritoryId, useTerritoriesStore } from './territoriesStore'

function resetStores() {
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
    pendingDelete: null,
    error: null,
  })
  useWaypointsStore.setState({
    waypoints: [],
    loaded: false,
    isPlacing: false,
    draft: null,
    editingId: null,
  })
  useTracksStore.setState({
    tracks: [],
    loaded: false,
    status: 'idle',
    recordingId: null,
    recordingStartedAt: null,
    points: [],
    distanceMeters: 0,
    persistError: null,
  })
  useJournalStore.setState({ observations: [], loaded: false, editingId: null })
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all([
    db.territories.clear(),
    db.waypoints.clear(),
    db.tracks.clear(),
    db.observations.clear(),
    db.settings.clear(),
  ])
  resetStores()
})

const store = () => useTerritoriesStore.getState()
const HERE = { lat: 46.8, lng: -71.2 }

async function createOk(name: string) {
  const result = await store().create(name)
  if (!result.ok) throw new Error(result.error)
  return result.territory
}

describe('territoriesStore', () => {
  it('creates a territory, trimmed, persisted in Dexie', async () => {
    const territory = await createOk('  Secteur   nord ')
    expect(territory.name).toBe('Secteur nord')
    expect(store().territories).toEqual([territory])
    expect(await db.territories.toArray()).toEqual([territory])
  })

  it('rejects empty, too long, duplicate (case/accent-insensitive) and reserved names', async () => {
    await createOk('Forêt')
    const empty = await store().create('   ')
    const long = await store().create('x'.repeat(81))
    const duplicate = await store().create('foret')
    const reserved = await store().create('NON CLASSE')
    for (const result of [empty, long, duplicate, reserved]) {
      expect(result.ok).toBe(false)
    }
    expect(duplicate).toMatchObject({ error: 'Un territoire porte déjà ce nom.' })
    expect(store().territories).toHaveLength(1)
    expect(await db.territories.count()).toBe(1)
  })

  it('renames, and refuses a name already used by another territory', async () => {
    const a = await createOk('A')
    await createOk('B')
    expect((await store().rename(a.id, 'B')).ok).toBe(false)
    expect((await store().rename(a.id, 'a')).ok).toBe(true) // same territory, other case
    const renamed = await store().rename(a.id, 'Nord')
    expect(renamed.ok).toBe(true)
    expect((await db.territories.get(a.id))?.name).toBe('Nord')
    expect(store().territories.find((t) => t.id === a.id)?.name).toBe('Nord')
  })

  it('archives and restores, keeping content and not deleting anything', async () => {
    const territory = await createOk('Nord')
    await db.waypoints.add({
      id: 'w',
      name: 'w',
      coordinate: HERE,
      category: 'general',
      territoryId: territory.id,
      createdAt: 'x',
      updatedAt: 'x',
    })
    await store().archive(territory.id)
    expect(store().territories[0].archivedAt).toBeTruthy()
    expect((await db.territories.get(territory.id))?.archivedAt).toBeTruthy()
    expect((await db.waypoints.get('w'))?.territoryId).toBe(territory.id)

    await store().restore(territory.id)
    expect('archivedAt' in store().territories[0]).toBe(false)
    expect((await db.territories.get(territory.id))?.archivedAt).toBeUndefined()
  })

  it('archiving the filtered territory resets the filter to « Tous »', async () => {
    const territory = await createOk('Nord')
    store().setFilter({ kind: 'territory', id: territory.id })
    await store().archive(territory.id)
    expect(store().filter).toEqual({ kind: 'all' })
  })

  it('persists the filter in settings and restores it on load', async () => {
    const territory = await createOk('Nord')
    store().setFilter({ kind: 'territory', id: territory.id })
    await vi.waitFor(async () =>
      expect(await getSetting('territoryFilter', null)).toEqual({
        kind: 'territory',
        id: territory.id,
      }),
    )

    useTerritoriesStore.setState({
      territories: [],
      loaded: false,
      filter: { kind: 'all' },
    })
    await store().load()
    expect(store().filter).toEqual({ kind: 'territory', id: territory.id })
    expect(store().territories).toHaveLength(1)
  })

  it('a stored filter pointing to a missing territory loads as « Tous »', async () => {
    await db.settings.put({
      key: 'territoryFilter',
      value: { kind: 'territory', id: 'disparu' },
    })
    await store().load()
    expect(store().filter).toEqual({ kind: 'all' })
  })

  it('still works when persisting the filter fails (storage unavailable)', async () => {
    vi.spyOn(db.settings, 'put').mockRejectedValue(new Error('quota'))
    expect(() => store().setFilter({ kind: 'unclassified' })).not.toThrow()
    expect(store().filter).toEqual({ kind: 'unclassified' })
    await Promise.resolve()
  })

  it('the active territory is the filtered, non-archived one', async () => {
    const territory = await createOk('Nord')
    expect(getActiveTerritoryId()).toBeUndefined()
    store().setFilter({ kind: 'territory', id: territory.id })
    expect(getActiveTerritoryId()).toBe(territory.id)
    store().setFilter({ kind: 'unclassified' })
    expect(getActiveTerritoryId()).toBeUndefined()
  })

  it('new tracks and journal entries inherit the active territory; otherwise « Non classé »', async () => {
    const territory = await createOk('Nord')

    await useTracksStore.getState().start()
    await useTracksStore.getState().stop()
    await useJournalStore.getState().create({ coordinate: HERE, notes: '' })
    expect(useTracksStore.getState().tracks[0].territoryId).toBeUndefined()
    expect(useJournalStore.getState().observations[0].territoryId).toBeUndefined()

    store().setFilter({ kind: 'territory', id: territory.id })
    await useTracksStore.getState().start()
    await useTracksStore.getState().stop()
    await useJournalStore.getState().create({ coordinate: HERE, notes: '' })
    const tracks = await db.tracks.toArray()
    const observations = await db.observations.toArray()
    expect(tracks.filter((t) => t.territoryId === territory.id)).toHaveLength(1)
    expect(observations.filter((o) => o.territoryId === territory.id)).toHaveLength(1)
  })

  describe('deletion', () => {
    async function seed() {
      const doomed = await createOk('À supprimer')
      const keep = await createOk('Garder')
      await useWaypointsStore.getState().load()
      await db.waypoints.bulkAdd([
        {
          id: 'w1',
          name: 'w1',
          coordinate: HERE,
          category: 'general',
          territoryId: doomed.id,
          createdAt: 'x',
          updatedAt: 'x',
        },
        {
          id: 'w2',
          name: 'w2',
          coordinate: HERE,
          category: 'general',
          territoryId: keep.id,
          createdAt: 'x',
          updatedAt: 'x',
        },
      ])
      await db.tracks.add({
        id: 't1',
        name: 't1',
        points: [],
        startedAt: '2026-10-01T10:00:00.000Z',
        territoryId: doomed.id,
      })
      await db.observations.add({
        id: 'o1',
        coordinate: HERE,
        timestamp: '2026-10-01T10:00:00.000Z',
        notes: 'o1',
        territoryId: doomed.id,
      })
      await Promise.all([
        useWaypointsStore.getState().load(),
        useTracksStore.getState().load(),
        useJournalStore.getState().load(),
      ])
      return { doomed, keep }
    }

    it('requesting a deletion changes nothing and reports what would move', async () => {
      const { doomed } = await seed()
      await store().requestDelete(doomed.id)
      expect(store().pendingDelete).toEqual({
        id: doomed.id,
        name: 'À supprimer',
        contents: { waypoints: 1, tracks: 1, observations: 1 },
      })
      expect(await db.territories.count()).toBe(2)
      expect((await db.waypoints.get('w1'))?.territoryId).toBe(doomed.id)
    })

    it('cancelling keeps everything', async () => {
      const { doomed } = await seed()
      await store().requestDelete(doomed.id)
      store().cancelDelete()
      expect(store().pendingDelete).toBeNull()
      expect(await store().confirmDelete()).toBeNull()
      expect(await db.territories.count()).toBe(2)
    })

    it('confirming moves the content to « Non classé » in the database AND in memory, deleting no data', async () => {
      const { doomed, keep } = await seed()
      store().setFilter({ kind: 'territory', id: doomed.id })
      await store().requestDelete(doomed.id)
      const moved = await store().confirmDelete()

      expect(moved).toEqual({ waypoints: 1, tracks: 1, observations: 1 })
      expect(store().territories.map((t) => t.id)).toEqual([keep.id])
      expect(store().pendingDelete).toBeNull()
      expect(store().filter).toEqual({ kind: 'all' })

      // Database: all three items still exist, now unclassified.
      expect(await db.waypoints.count()).toBe(2)
      expect(await db.tracks.count()).toBe(1)
      expect(await db.observations.count()).toBe(1)
      expect((await db.waypoints.get('w1'))?.territoryId).toBeUndefined()
      expect((await db.waypoints.get('w1'))?.coordinate).toEqual(HERE)
      expect((await db.waypoints.get('w2'))?.territoryId).toBe(keep.id)

      // Memory mirrors it.
      const waypoint = useWaypointsStore.getState().waypoints.find((w) => w.id === 'w1')
      expect(waypoint).toBeDefined()
      expect(waypoint?.territoryId).toBeUndefined()
      expect(useTracksStore.getState().tracks[0].territoryId).toBeUndefined()
      expect(useJournalStore.getState().observations[0].territoryId).toBeUndefined()
      expect(
        useWaypointsStore.getState().waypoints.find((w) => w.id === 'w2')?.territoryId,
      ).toBe(keep.id)
    })

    it('a failed deletion changes nothing and says so', async () => {
      const { doomed } = await seed()
      await store().requestDelete(doomed.id)
      vi.spyOn(db, 'transaction').mockRejectedValue(new Error('disque plein'))
      expect(await store().confirmDelete()).toBeNull()
      expect(store().error).toContain('rien n’a été modifié')
      expect(store().territories).toHaveLength(2)
      expect((await db.waypoints.get('w1'))?.territoryId).toBe(doomed.id)
    })
  })
})
