import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './db'
import {
  addBloodMarker,
  createBloodSession,
  deleteBloodSession,
  listBloodSessions,
  sessionContentCounts,
  updateBloodSession,
} from './bloodSessionsRepository'

const HERE = { lat: 46.8, lng: -71.2, accuracyMeters: 6 }

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('addBloodMarker', () => {
  it('creates a REAL waypoint named Sang 01, Sang 02… with its metadata', async () => {
    const session = await createBloodSession({ name: 'R1', territoryId: 'terr' })
    const a = await addBloodMarker({
      sessionId: session.id,
      kind: 'blood',
      coordinate: HERE,
      origin: 'gps',
    })
    const b = await addBloodMarker({
      sessionId: session.id,
      kind: 'blood',
      coordinate: { lat: 46.801, lng: -71.2 },
      origin: 'manual',
    })
    expect([a.name, b.name]).toEqual(['Sang 01', 'Sang 02'])
    const stored = await db.waypoints.get(a.id)
    expect(stored).toMatchObject({
      category: 'blood',
      bloodKind: 'blood',
      origin: 'gps',
      sessionId: session.id,
      territoryId: 'terr',
      coordinate: HERE,
    })
    expect(stored?.createdAt).toBeTruthy()
    expect((await db.waypoints.get(b.id))?.origin).toBe('manual')
  })

  it('never reuses or renumbers a number after a deletion or a reload', async () => {
    const session = await createBloodSession({ name: 'R1' })
    const add = () =>
      addBloodMarker({
        sessionId: session.id,
        kind: 'blood',
        coordinate: HERE,
        origin: 'gps',
      })
    const first = await add()
    const second = await add()
    await db.waypoints.delete(second.id)
    const third = await add()
    expect(third.name).toBe('Sang 03')
    // « reload »: counters come from the database, not from memory.
    const [reloaded] = await listBloodSessions()
    expect(reloaded.counters.blood).toBe(3)
    expect((await db.waypoints.get(first.id))?.name).toBe('Sang 01')
  })

  it('gives distinct numbers and ids to rapid presses (no technical duplicate)', async () => {
    const session = await createBloodSession({ name: 'R1' })
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        addBloodMarker({
          sessionId: session.id,
          kind: 'blood',
          coordinate: HERE,
          origin: 'gps',
        }),
      ),
    )
    expect(new Set(results.map((w) => w.id)).size).toBe(8)
    expect(results.map((w) => w.name).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `Sang 0${i + 1}`),
    )
    expect(await db.waypoints.count()).toBe(8)
    expect((await db.bloodSessions.get(session.id))?.counters.blood).toBe(8)
  })

  it('writes nothing when the write fails (waypoint and counter roll back together)', async () => {
    const session = await createBloodSession({ name: 'R1' })
    const proto = Object.getPrototypeOf(db.waypoints) as {
      add: (this: { name: string }, ...args: unknown[]) => Promise<unknown>
    }
    const original = proto.add
    proto.add = function (this: { name: string }, ...args: unknown[]) {
      if (this.name === 'waypoints') return Promise.reject(new Error('disque plein'))
      return original.apply(this, args)
    }
    try {
      await expect(
        addBloodMarker({
          sessionId: session.id,
          kind: 'blood',
          coordinate: HERE,
          origin: 'gps',
        }),
      ).rejects.toThrow('disque plein')
    } finally {
      proto.add = original
    }
    expect(await db.waypoints.count()).toBe(0)
    expect((await db.bloodSessions.get(session.id))?.counters).toEqual({})
    // The same press works right after: the number was not consumed.
    const retry = await addBloodMarker({
      sessionId: session.id,
      kind: 'blood',
      coordinate: HERE,
      origin: 'gps',
    })
    expect(retry.name).toBe('Sang 01')
  })

  it('numbers other markers by kind and leaves the position locked afterwards', async () => {
    const session = await createBloodSession({ name: 'R1' })
    const shot = await addBloodMarker({
      sessionId: session.id,
      kind: 'shot_site',
      coordinate: HERE,
      origin: 'gps',
    })
    const clue1 = await addBloodMarker({
      sessionId: session.id,
      kind: 'other_clue',
      coordinate: HERE,
      origin: 'gps',
    })
    expect([shot.name, clue1.name]).toEqual(['Lieu du tir', 'Autre indice 01'])
    const { updateWaypoint } = await import('./waypointsRepository')
    await expect(
      updateWaypoint(shot.id, { coordinate: { lat: 1, lng: 1 } } as never),
    ).rejects.toThrow()
    await updateWaypoint(shot.id, { name: 'Tir', notes: 'chevreuil' })
    expect((await db.waypoints.get(shot.id))?.coordinate).toEqual(HERE)
  })

  it('refuses an unknown session', async () => {
    await expect(
      addBloodMarker({
        sessionId: 'nope',
        kind: 'blood',
        coordinate: HERE,
        origin: 'gps',
      }),
    ).rejects.toThrow(/introuvable/)
  })
})

describe('sessions: update and deletion', () => {
  it('shows what a deletion would affect, then keeps content when asked', async () => {
    const session = await createBloodSession({ name: 'R1', status: 'finished' })
    const wp = await addBloodMarker({
      sessionId: session.id,
      kind: 'blood',
      coordinate: HERE,
      origin: 'gps',
    })
    await db.photos.add({
      id: 'p1',
      waypointId: wp.id,
      blob: new Blob(['x']),
      originalBlob: new Blob(['x']),
      createdAt: '2026-10-07T00:00:00.000Z',
    })
    await db.tracks.add({
      id: 't1',
      name: 'T',
      points: [],
      startedAt: '2026-10-07T00:00:00.000Z',
      sessionId: session.id,
    })
    expect(await sessionContentCounts(session.id)).toEqual({
      waypoints: 1,
      photos: 1,
      tracks: 1,
    })

    await deleteBloodSession(session.id, { deleteContent: false })
    expect(await db.bloodSessions.count()).toBe(0)
    expect(await db.waypoints.count()).toBe(1)
    expect((await db.waypoints.get(wp.id))?.sessionId).toBeUndefined()
    expect((await db.tracks.get('t1'))?.sessionId).toBeUndefined()
    expect(await db.photos.count()).toBe(1)
  })

  it('deletes content (with photos) only when explicitly asked', async () => {
    const session = await createBloodSession({ name: 'R1', status: 'finished' })
    const wp = await addBloodMarker({
      sessionId: session.id,
      kind: 'blood',
      coordinate: HERE,
      origin: 'gps',
    })
    await db.photos.add({
      id: 'p1',
      waypointId: wp.id,
      blob: new Blob(['x']),
      originalBlob: new Blob(['x']),
      createdAt: '2026-10-07T00:00:00.000Z',
    })
    await db.waypoints.add({
      id: 'other',
      name: 'Autre',
      coordinate: HERE,
      category: 'general',
      createdAt: 'x',
      updatedAt: 'x',
    })
    await deleteBloodSession(session.id, { deleteContent: true })
    expect(await db.waypoints.toArray().then((w) => w.map((x) => x.id))).toEqual([
      'other',
    ])
    expect(await db.photos.count()).toBe(0)
  })

  it('finishing keeps everything: only the status changes', async () => {
    const session = await createBloodSession({ name: 'R1', status: 'active' })
    await updateBloodSession(session.id, { status: 'finished', endedAt: 'z' })
    const [stored] = await listBloodSessions()
    expect(stored).toMatchObject({ name: 'R1', status: 'finished', endedAt: 'z' })
  })
})
