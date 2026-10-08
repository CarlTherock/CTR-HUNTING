// @vitest-environment node
/* eslint-disable @typescript-eslint/no-non-null-assertion -- test code asserts presence right before use */
import { afterEach, describe, expect, it } from 'vitest'
import type Dexie from 'dexie'
import { createTestDatabase } from '@/test/backupFixtures'
import { createBackup } from './backupCreate'
import { readBackup } from './backupRead'
import { planRestore } from './restorePlan'
import { applyRestore, type ConflictMode } from './restoreApply'

const opened: Dexie[] = []
function newDb(options?: { bloodSessions?: boolean }): Dexie {
  const database = createTestDatabase(options)
  opened.push(database)
  return database
}
afterEach(async () => {
  while (opened.length) {
    const database = opened.pop()!
    database.close()
    await database.delete()
  }
})

const NOW = '2026-10-07T12:00:00.000Z'
const SESSION = {
  id: 's1',
  name: 'Recherche du 7 octobre',
  createdAt: NOW,
  updatedAt: NOW,
  startedAt: NOW,
  endedAt: NOW,
  status: 'finished',
  species: 'Cerf de Virginie',
  trackId: 'tr-blood',
  counters: { blood: 3, shot_site: 1 },
}
const BLOOD_TRACK = {
  id: 'tr-blood',
  name: 'Recherche du 7 octobre',
  kind: 'blood',
  sessionId: 's1',
  startedAt: NOW,
  endedAt: NOW,
  distanceMeters: 50,
  breaks: [2],
  points: [
    { lat: 46.8, lng: -71.2, timestamp: NOW },
    { lat: 46.8005, lng: -71.2, timestamp: NOW },
    { lat: 46.81, lng: -71.2, timestamp: NOW },
  ],
}
const TRIP_TRACK = {
  id: 'tr-trip',
  name: 'Trajet vert',
  kind: 'normal',
  color: '#16a34a',
  startedAt: NOW,
  points: [{ lat: 46.7, lng: -71.1, timestamp: NOW }],
}
const wpt = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  coordinate: { lat: 46.8, lng: -71.2, accuracyMeters: 4 },
  category: 'blood',
  sessionId: 's1',
  bloodKind: 'blood',
  origin: 'gps',
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
})

async function seed(database: Dexie) {
  await database.table('bloodSessions').add(SESSION)
  await database.table('tracks').bulkAdd([BLOOD_TRACK, TRIP_TRACK])
  await database
    .table('waypoints')
    .bulkAdd([wpt('w1', 'Sang 01'), wpt('w3', 'Sang 03', { origin: 'manual' })])
}

async function restore(source: Dexie, target: Dexie, mode: ConflictMode = 'keep-local') {
  const { blob } = await createBackup({ database: source })
  const parsed = await readBackup(blob)
  const plan = await planRestore(parsed, { database: target })
  const report = await applyRestore(plan, { database: target, mode })
  return { plan, report }
}

describe('backup of blood-search sessions', () => {
  it('restores sessions, red track, segments, colours, clues and numbering counters', async () => {
    const source = newDb()
    await seed(source)
    const target = newDb()
    const { report } = await restore(source, target)
    expect(report.invalid).toEqual([])

    expect(await target.table('bloodSessions').toArray()).toEqual([SESSION])
    expect(await target.table('tracks').get('tr-blood')).toEqual(BLOOD_TRACK)
    expect((await target.table('tracks').get('tr-trip'))?.color).toBe('#16a34a')
    const waypoints = await target.table('waypoints').toArray()
    expect(waypoints.map((w) => [w.name, w.origin, w.sessionId])).toEqual([
      ['Sang 01', 'gps', 's1'],
      ['Sang 03', 'manual', 's1'],
    ])
    // The deleted « Sang 02 » is not renumbered, the counter stays at 3.
    expect((await target.table('bloodSessions').get('s1')).counters.blood).toBe(3)
  })

  it('is idempotent: restoring twice adds nothing', async () => {
    const source = newDb()
    await seed(source)
    const target = newDb()
    await restore(source, target)
    const second = await restore(source, target)
    expect(second.report.addedTotal).toBe(0)
    expect(await target.table('bloodSessions').count()).toBe(1)
  })

  it('keep-both: the copy of a session keeps its own clues and track linked', async () => {
    const source = newDb()
    await seed(source)
    const target = newDb()
    await target
      .table('bloodSessions')
      .add({ ...SESSION, name: 'Locale', status: 'active' })
    const { report } = await restore(source, target, 'keep-both')
    expect(report.conflicts.some((c) => c.table === 'bloodSessions')).toBe(true)
    const sessions = await target.table('bloodSessions').toArray()
    expect(sessions).toHaveLength(2)
    const copy = sessions.find((s) => s.id !== 's1')!
    // The track and the clues were not in conflict: they are added once and
    // follow the COPY of the session, never the local one.
    const track = await target.table('tracks').get(copy.trackId)
    expect(track.sessionId).toBe(copy.id)
    const clues = await target.table('waypoints').toArray()
    expect(clues.every((w) => w.sessionId === copy.id)).toBe(true)
    // Local session untouched.
    expect((await target.table('bloodSessions').get('s1')).name).toBe('Locale')
  })

  it('rejects invalid sessions and tracks without writing them', async () => {
    const source = newDb()
    await source.table('bloodSessions').bulkAdd([
      { ...SESSION, id: 'bad-status', status: 'weird' },
      { ...SESSION, id: 'bad-counters', counters: { blood: -1 } },
    ])
    await source.table('tracks').add({ ...BLOOD_TRACK, id: 'bad-breaks', breaks: [99] })
    const target = newDb()
    const { report } = await restore(source, target)
    expect(report.invalid.length).toBe(3)
    expect(await target.table('bloodSessions').count()).toBe(0)
    expect(await target.table('tracks').count()).toBe(0)
  })

  it('restores a backup made before sessions existed, without touching local sessions', async () => {
    const oldSource = newDb({ bloodSessions: false })
    await oldSource.table('tracks').add({
      id: 'old',
      name: 'Ancienne',
      points: [{ lat: 1, lng: 1, timestamp: NOW }],
      startedAt: NOW,
    })
    const target = newDb()
    await target.table('bloodSessions').add(SESSION)
    await restore(oldSource, target)
    expect(await target.table('bloodSessions').count()).toBe(1)
    const old = await target.table('tracks').get('old')
    expect('kind' in old).toBe(false)
    expect('color' in old).toBe(false)
  })

  it('reports sessions as unsupported when restoring into a database without the table', async () => {
    const source = newDb()
    await seed(source)
    const target = newDb({ bloodSessions: false })
    const { report } = await restore(source, target)
    expect(report.unsupported).toBeGreaterThan(0)
    expect(report.addedTotal).toBeGreaterThan(0) // the rest still restores
  })
})
