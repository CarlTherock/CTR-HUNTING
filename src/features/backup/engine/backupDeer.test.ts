// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import type Dexie from 'dexie'
import { createTestDatabase } from '@/test/backupFixtures'
import { createBackup } from './backupCreate'
import { readBackup } from './backupRead'
import { planRestore } from './restorePlan'
import { applyRestore } from './restoreApply'
import { validateRecord } from './validate'

const opened: Dexie[] = []
function newDb(): Dexie {
  const database = createTestDatabase()
  opened.push(database)
  return database
}
afterEach(async () => {
  while (opened.length) {
    const database = opened.pop()
    if (!database) continue
    database.close()
    await database.delete()
  }
})

const NOW = '2026-10-07T12:00:00.000Z'
/** An observation exactly as the journal wrote it before DeerTracker existed. */
const OLD_ENTRY = {
  id: 'o-old',
  coordinate: { lat: 46.8, lng: -71.2 },
  timestamp: NOW,
  notes: 'ancienne entrée',
}
const DEER_ENTRY = {
  id: 'o-deer',
  coordinate: { lat: 46.81, lng: -71.21, accuracyMeters: 6 },
  timestamp: '2026-10-06T06:30:00.000Z',
  createdAt: NOW,
  notes: 'trois biches',
  positionOrigin: 'gps',
  deer: {
    kind: 'sighting',
    count: 3,
    name: 'La borgne',
    sameAnimalNote: 'peut-être celle du ruisseau',
  },
  conditionsMeta: { source: 'Open-Meteo', fetchedAt: NOW, cached: false },
  conditions: {
    temperatureCelsius: 3,
    windSpeedKmh: 8,
    windDirectionDegrees: 270,
    cloudCoverPercent: 10,
  },
}

describe('backup of DeerTracker entries', () => {
  it('restores deer entries untouched and leaves older journal entries unclassified', async () => {
    const source = newDb()
    await source.table('observations').bulkAdd([OLD_ENTRY, DEER_ENTRY])
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    const plan = await planRestore(await readBackup(blob), { database: target })
    const report = await applyRestore(plan, { database: target, mode: 'keep-local' })
    expect(report.invalid).toEqual([])

    expect(await target.table('observations').get('o-deer')).toEqual(DEER_ENTRY)
    const old = await target.table('observations').get('o-old')
    expect(old).toEqual(OLD_ENTRY)
    expect(old).not.toHaveProperty('deer') // never reclassified
    // Locked position: coordinates are identical to the digit.
    expect((await target.table('observations').get('o-deer')).coordinate).toEqual(
      DEER_ENTRY.coordinate,
    )
  })

  it('is idempotent: no duplicate on a second restore', async () => {
    const source = newDb()
    await source.table('observations').bulkAdd([DEER_ENTRY])
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    for (let i = 0; i < 2; i += 1) {
      const plan = await planRestore(await readBackup(blob), { database: target })
      await applyRestore(plan, { database: target, mode: 'keep-local' })
    }
    expect(await target.table('observations').count()).toBe(1)
  })

  it('rejects a malformed deer record instead of storing it', () => {
    const bad = validateRecord('observations', {
      ...DEER_ENTRY,
      deer: { kind: 'dragon' },
    })
    expect(bad.ok).toBe(false)
    expect(validateRecord('observations', DEER_ENTRY).ok).toBe(true)
    expect(validateRecord('observations', OLD_ENTRY).ok).toBe(true)
  })

  it('keeps a moose observation made from « + Repère » (species marker, no deer record)', async () => {
    const moose = {
      id: 'o-moose',
      coordinate: { lat: 46.82, lng: -71.22 },
      timestamp: NOW,
      notes: 'Orignal — Animal observé × 1',
      positionOrigin: 'manual',
      species: 'moose',
    }
    const source = newDb()
    await source.table('observations').bulkAdd([moose])
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    const plan = await planRestore(await readBackup(blob), { database: target })
    await applyRestore(plan, { database: target, mode: 'keep-local' })
    const restored = await target.table('observations').get('o-moose')
    expect(restored).toEqual(moose)
    expect(restored).not.toHaveProperty('deer')
    expect(validateRecord('observations', { ...moose, species: 'wolf' }).ok).toBe(false)
  })

  it('keeps a shot record from « Après le tir » untouched and rejects a malformed one', async () => {
    const shot = {
      id: 'o-shot',
      coordinate: { lat: 46.8, lng: -71.2, accuracyMeters: 5 },
      timestamp: NOW,
      notes: 'vent de face',
      positionOrigin: 'gps',
      photoIds: ['p1'],
      shot: {
        species: 'deer',
        reaction: 'a sursauté',
        fleeDirectionDegrees: 90,
        estimatedAnimalPosition: { lat: 46.81, lng: -71.21 },
        lastConfirmedPosition: { lat: 46.802, lng: -71.201 },
        searchSessionId: 's1',
      },
    }
    const source = newDb()
    await source.table('observations').bulkAdd([shot])
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    const plan = await planRestore(await readBackup(blob), { database: target })
    await applyRestore(plan, { database: target, mode: 'keep-local' })
    expect(await target.table('observations').get('o-shot')).toEqual(shot)

    expect(validateRecord('observations', shot).ok).toBe(true)
    expect(
      validateRecord('observations', { ...shot, shot: { species: 'wolf' } }).ok,
    ).toBe(false)
    expect(
      validateRecord('observations', {
        ...shot,
        shot: { species: 'deer', estimatedAnimalPosition: { lat: 'x' } },
      }).ok,
    ).toBe(false)
  })

  it('keeps the presumed impact of a shot through backup and restore, and rejects bad ones', async () => {
    const impact = {
      species: 'moose',
      view: 'lateral-left',
      x: 0.6123,
      y: 0.4567,
      regionId: 'thorax',
      presumed: true,
      recordedAt: NOW,
      illustrationVersion: 'orignal-profil-gauche-1',
      note: 'à gauche de l’épaule',
    }
    const shot = {
      id: 'o-shot-impact',
      coordinate: { lat: 46.8, lng: -71.2 },
      timestamp: NOW,
      notes: '',
      shot: { species: 'moose', reaction: 'a bondi', impact },
    }
    // A shot saved before this feature existed has no `impact` and stays valid.
    const before = {
      id: 'o-shot-before',
      coordinate: { lat: 46.8, lng: -71.2 },
      timestamp: NOW,
      notes: '',
      shot: { species: 'deer' },
    }
    const source = newDb()
    await source.table('observations').bulkAdd([shot, before])
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    const plan = await planRestore(await readBackup(blob), { database: target })
    const report = await applyRestore(plan, { database: target, mode: 'keep-local' })
    expect(report.invalid).toEqual([])
    expect(await target.table('observations').get('o-shot-impact')).toEqual(shot)
    const old = await target.table('observations').get('o-shot-before')
    expect(old).toEqual(before)
    expect(old.shot).not.toHaveProperty('impact')

    const withImpact = (patch: Record<string, unknown>) =>
      validateRecord('observations', {
        ...shot,
        shot: { ...shot.shot, impact: { ...impact, ...patch } },
      }).ok
    expect(withImpact({})).toBe(true)
    expect(withImpact({ x: 1.2 })).toBe(false)
    expect(withImpact({ y: -0.1 })).toBe(false)
    expect(withImpact({ x: 'a' })).toBe(false)
    expect(withImpact({ species: 'wolf' })).toBe(false)
    expect(withImpact({ view: 'top' })).toBe(false)
    expect(withImpact({ presumed: false })).toBe(false)
    expect(withImpact({ recordedAt: 'hier' })).toBe(false)
    expect(withImpact({ illustrationVersion: '' })).toBe(false)
    expect(withImpact({ regionId: 3 })).toBe(false)
  })
})
