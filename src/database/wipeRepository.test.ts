import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import { deleteAllLocalData, summarizeLocalData } from './wipeRepository'

const NOW = '2026-10-07T12:00:00.000Z'

async function seedEverything() {
  await db.territories.add({ id: 't1', name: 'Nord', createdAt: NOW, updatedAt: NOW })
  await db.waypoints.bulkAdd([
    {
      id: 'w1',
      name: 'A',
      coordinate: { lat: 46, lng: -71 },
      category: 'stand_blind',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: 'w2',
      name: 'B',
      coordinate: { lat: 46.1, lng: -71 },
      category: 'stand_blind',
      territoryId: 't1',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ])
  await db.tracks.add({ id: 'tr1', name: 'T', points: [], startedAt: NOW })
  await db.observations.add({
    id: 'o1',
    coordinate: { lat: 46, lng: -71 },
    timestamp: NOW,
    notes: 'note',
  })
  await db.photos.add({
    id: 'p1',
    waypointId: 'w1',
    blob: new Blob(['x']),
    originalBlob: new Blob(['x']),
    createdAt: NOW,
  })
  await db.offlineAreas.add({ id: 'a1', name: 'Zone', status: 'complete' } as never)
  await db.settings.bulkPut([
    { key: 'fieldModeEnabled', value: true },
    { key: 'lastBackupAt', value: NOW },
  ])
  await db.syncQueue.add({
    id: 'q1',
    entity: 'waypoint',
    entityId: 'w1',
    operation: 'create',
    queuedAt: NOW,
  })
}

async function counts(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    db.tables.map(async (table) => [table.name, await table.count()] as const),
  )
  return Object.fromEntries(entries)
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('summarizeLocalData', () => {
  it('counts what a deletion would remove, without changing anything', async () => {
    await seedEverything()
    const before = await counts()

    const summary = await summarizeLocalData()

    expect(summary).toEqual({
      waypoints: 2,
      tracks: 1,
      observations: 1,
      photos: 1,
      territories: 1,
      offlineAreas: 1,
      settings: 2,
    })
    expect(await counts()).toEqual(before)
  })
})

describe('deleteAllLocalData', () => {
  it('covers every table of the database (a table added later is included)', async () => {
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'observations',
      'offlineAreas',
      'photos',
      'settings',
      'syncQueue',
      'territories',
      'tracks',
      'waypoints',
    ])
  })

  it('empties every table', async () => {
    await seedEverything()
    expect(Object.values(await counts()).every((n) => n > 0)).toBe(true)

    await deleteAllLocalData()

    expect(Object.values(await counts()).every((n) => n === 0)).toBe(true)
  })

  it('is all-or-nothing: when one table cannot be cleared, nothing is deleted', async () => {
    await seedEverything()
    const before = await counts()
    // Inside a transaction Dexie hands out its own table objects, so the
    // failure is injected on the shared prototype. `photos` comes after
    // `waypoints`/`tracks`/`observations`/`settings` in table order: those
    // would already be empty without the rollback.
    const proto = Object.getPrototypeOf(db.photos) as {
      clear: (this: { name: string }) => Promise<void>
    }
    const original = proto.clear
    const cleared: string[] = []
    vi.spyOn(proto, 'clear').mockImplementation(function (this: { name: string }) {
      if (this.name === 'photos') return Promise.reject(new Error('disque plein'))
      cleared.push(this.name)
      return original.call(this)
    })

    await expect(deleteAllLocalData()).rejects.toThrow('disque plein')

    // The first clear really ran before the failure: only the transaction
    // rollback explains why the data is still there.
    expect(cleared).toContain('waypoints')
    expect(await counts()).toEqual(before)
  })

  it('works on an already empty database', async () => {
    await expect(deleteAllLocalData()).resolves.toBeUndefined()
  })
})
