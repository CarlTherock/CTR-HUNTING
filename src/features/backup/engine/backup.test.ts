// @vitest-environment node
// Node environment on purpose: its structuredClone round-trips real Blobs
// through fake-indexeddb, so photo bytes can be compared byte for byte
// (jsdom's Blob is silently emptied by fake-indexeddb).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Dexie from 'dexie'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  blobOf,
  bytesOfBlob,
  createTestDatabase,
  randomBytes,
  seedEverything,
} from '@/test/backupFixtures'
import { db } from '@/database/db'
import { createBackup } from './backupCreate'
import { BackupFormatError, readBackup } from './backupRead'
import { planRestore } from './restorePlan'
import { RestoreWriteError, applyRestore, type ConflictMode } from './restoreApply'
import { BACKUP_TABLES, EXCLUDED_TABLES, BACKUP_SCHEMA_VERSION } from './format'
import { BackupCancelledError } from '../core/tasks'

const opened: Dexie[] = []
function newDb(options?: { territories?: boolean }): Dexie {
  const database = createTestDatabase(options)
  opened.push(database)
  return database
}

afterEach(async () => {
  vi.restoreAllMocks()
  while (opened.length) {
    const database = opened.pop()!
    database.close()
    await database.delete()
  }
})

async function restoreAll(
  file: Blob,
  target: Dexie,
  mode: ConflictMode = 'keep-local',
) {
  const parsed = await readBackup(file)
  const plan = await planRestore(parsed, { database: target })
  const report = await applyRestore(plan, { database: target, mode })
  return { plan, report }
}

async function snapshot(database: Dexie) {
  const out: Record<string, unknown[]> = {}
  for (const table of database.tables) {
    if (table.name === 'photos') {
      const photos = await table.toArray()
      out.photos = await Promise.all(
        photos.map(async (p) => ({
          ...p,
          blob: await bytesOfBlob(p.blob),
          originalBlob: await bytesOfBlob(p.originalBlob),
        })),
      )
    } else {
      out[table.name] = await table.toArray()
    }
  }
  return out
}

function tamper(
  archive: Uint8Array,
  edit: (files: Record<string, Uint8Array>) => void,
): Blob {
  const files = unzipSync(archive)
  edit(files)
  return new Blob([zipSync(files) as BlobPart], { type: 'application/zip' })
}

async function bytesFromBlob(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

describe('table coverage', () => {
  it('every Dexie table is either backed up or deliberately excluded', () => {
    const covered = new Set<string>([...BACKUP_TABLES, ...EXCLUDED_TABLES])
    const tables = [...db.tables.map((t) => t.name), 'territories']
    for (const name of tables) expect(covered.has(name)).toBe(true)
    const test = newDb()
    for (const table of test.tables) expect(covered.has(table.name)).toBe(true)
  })
})

describe('full backup round trip', () => {
  it('restores every table, relation and photo byte for byte into an empty database', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob, manifest, photoCount } = await createBackup({ database: source })

    expect(manifest.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    expect(manifest.counts).toMatchObject({
      territories: 1,
      waypoints: 2,
      tracks: 1,
      observations: 1,
      photos: 3,
      offlineAreas: 1,
      settings: 1,
    })
    expect(photoCount).toBe(3)

    const target = newDb()
    const { plan, report } = await restoreAll(blob, target)
    expect(plan.totals.new).toBe(10)
    expect(report.invalid).toEqual([])
    expect(report.conflicts).toEqual([])

    const before = await snapshot(source)
    const after = await snapshot(target)

    // Exact records, including exact coordinates and unknown extra fields.
    expect(after.territories).toEqual(before.territories)
    expect(after.waypoints).toEqual(before.waypoints)
    expect(after.tracks).toEqual(before.tracks)
    expect(after.observations).toEqual(before.observations)
    expect(after.photos).toEqual(before.photos)

    const wp = (after.waypoints as { id: string; coordinate: unknown }[]).find(
      (w) => w.id === 'wp-1',
    )
    expect(wp!.coordinate).toEqual({
      lat: 46.123456789012345,
      lng: -71.987654321098765,
      altitude: 231.4,
      accuracyMeters: 4.5,
    })
    const track = (after.tracks as Record<string, unknown>[])[0]
    expect(track.status).toBe('interrupted')
    expect(track.pauses).toEqual([
      { startedAt: '2026-09-05T09:10:00.000Z', endedAt: '2026-09-05T09:20:00.000Z' },
    ])
    expect(track.interruptedAt).toBe('2026-09-05T09:30:00.000Z')
    expect(track.territoryId).toBe('terr-1')
  })

  it('keeps originalBlob distinct from blob, and shares bytes when they are equal', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    await restoreAll(blob, target)

    const edited = await target.table('photos').get('ph-1')
    expect(await bytesOfBlob(edited.blob)).toEqual(Array.from(randomBytes(2048, 7)))
    expect(await bytesOfBlob(edited.originalBlob)).toEqual(Array.from(randomBytes(4096, 9)))
    expect(edited.blob.type).toBe('image/jpeg')

    const plain = await target.table('photos').get('ph-2')
    expect(await bytesOfBlob(plain.blob)).toEqual(await bytesOfBlob(plain.originalBlob))
    const png = await target.table('photos').get('ph-3')
    expect(png.blob.type).toBe('image/png')
    expect(png.observationId).toBe('ob-1')
  })

  it('stores unedited photos once and edited originals as separate entries', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const names = Object.keys(unzipSync(await bytesFromBlob(blob)))
    expect(names.filter((n) => n.startsWith('media/'))).toHaveLength(4) // 3 blobs + 1 original
    expect(names).toContain('manifest.json')
  })

  it('never exports secrets, caches, device-only settings or the sync queue', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const files = unzipSync(await bytesFromBlob(blob))
    const everything = Object.values(files).map((f) => strFromU8(f)).join('\n')
    expect(everything).not.toContain('SECRET-DO-NOT-EXPORT')
    expect(everything).not.toContain('someApiKey')
    expect(everything).not.toContain('lastWeatherForecast')
    expect(everything).not.toContain('lastBackupAt')
    expect(Object.keys(files).some((n) => n.includes('syncQueue'))).toBe(false)
    const settings = JSON.parse(strFromU8(files['data/settings.json']))
    expect(settings).toEqual([{ key: 'fieldModeEnabled', value: true }])

    const target = newDb()
    await restoreAll(blob, target)
    expect(await target.table('syncQueue').count()).toBe(0)
  })

  it('restores offline areas as metadata only, flagged for re-download', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    await restoreAll(blob, target)
    const area = await target.table('offlineAreas').get('area-1')
    expect(area).toMatchObject({
      name: 'Lac Mégantic',
      bounds: { west: -71.3, south: 46.7, east: -71.1, north: 46.9 },
      minZoom: 10,
      maxZoom: 14,
      baseLayer: 'outdoor',
      status: 'interrupted',
      tilesDownloaded: 0,
      bytesDownloaded: 0,
      tileUrls: [],
    })
  })

  it('preserves numbers exactly in a large track', async () => {
    const source = newDb()
    const points = Array.from({ length: 20_000 }, (_, i) => ({
      lat: 46 + Math.sin(i) * 0.123456789,
      lng: -71 + Math.cos(i) * 0.987654321,
      timestamp: new Date(1_790_000_000_000 + i * 1000).toISOString(),
    }))
    await source.table('tracks').add({
      id: 'big',
      name: 'Longue',
      startedAt: points[0].timestamp,
      points,
    })
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    await restoreAll(blob, target)
    const restored = await target.table('tracks').get('big')
    expect(restored.points).toEqual(points)
  })

  it('works against a database without territories (older schema)', async () => {
    const source = newDb({ territories: false })
    await seedEverything(source)
    const { blob, manifest } = await createBackup({ database: source })
    expect(manifest.counts.territories).toBeUndefined()
    const target = newDb({ territories: false })
    const { report } = await restoreAll(blob, target)
    expect(report.invalid).toEqual([])
    expect(await target.table('waypoints').count()).toBe(2)
  })

  it('reports territories of a newer backup as unsupported when this database has none, without failing', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb({ territories: false })
    const { plan, report } = await restoreAll(blob, target)
    expect(plan.preview.territories?.unsupported).toBe(1)
    expect(report.unsupported).toBe(1)
    expect(await target.table('waypoints').count()).toBe(2)
    // the territoryId field of the waypoint is still preserved
    expect((await target.table('waypoints').get('wp-1')).territoryId).toBe('terr-1')
  })
})

describe('refusing bad files (nothing is written)', () => {
  async function validArchive() {
    const source = newDb()
    await seedEverything(source)
    return bytesFromBlob((await createBackup({ database: source })).blob)
  }

  async function expectRefused(file: Blob, code: string) {
    const target = newDb()
    await expect(readBackup(file)).rejects.toMatchObject({ code })
    await expect(readBackup(file)).rejects.toBeInstanceOf(BackupFormatError)
    for (const table of target.tables) expect(await table.count()).toBe(0)
  }

  it('refuses a file that is not a zip', async () => {
    await expectRefused(new Blob(['{"hello":"world"} '.repeat(5)]), 'not-a-backup')
  })

  it('refuses an empty or tiny file', async () => {
    await expectRefused(new Blob([]), 'not-a-backup')
  })

  it('refuses a truncated archive', async () => {
    const archive = await validArchive()
    await expectRefused(new Blob([archive.subarray(0, Math.floor(archive.length * 0.6)) as BlobPart]), 'corrupt')
  })

  it('refuses an archive whose photo bytes were altered (checksum)', async () => {
    const archive = await validArchive()
    const file = tamper(archive, (files) => {
      const name = Object.keys(files).find((n) => n.startsWith('media/'))!
      const copy = files[name].slice()
      copy[0] ^= 0xff
      files[name] = copy
    })
    await expectRefused(file, 'checksum')
  })

  it('refuses an archive missing a listed file', async () => {
    const archive = await validArchive()
    const file = tamper(archive, (files) => {
      delete files['data/tracks.json']
    })
    await expectRefused(file, 'incomplete')
  })

  it('refuses an archive without manifest', async () => {
    const archive = await validArchive()
    const file = tamper(archive, (files) => {
      delete files['manifest.json']
    })
    await expectRefused(file, 'not-a-backup')
  })

  it('refuses a zip that is not one of our backups', async () => {
    const file = new Blob([zipSync({ 'manifest.json': strToU8('{"format":"autre","schemaVersion":1,"counts":{},"files":{}}') }) as BlobPart])
    await expectRefused(file, 'unknown-format')
  })

  it('refuses a newer schema version with a clear message', async () => {
    const archive = await validArchive()
    const file = tamper(archive, (files) => {
      const manifest = JSON.parse(strFromU8(files['manifest.json']))
      manifest.schemaVersion = BACKUP_SCHEMA_VERSION + 1
      files['manifest.json'] = strToU8(JSON.stringify(manifest))
    })
    await expectRefused(file, 'newer-version')
    await expect(readBackup(file)).rejects.toThrow(/plus récent/)
  })

  it.each([0, -1, 1.5, '1', null])('refuses an invalid schema version %j', async (version) => {
    const archive = await validArchive()
    const file = tamper(archive, (files) => {
      const manifest = JSON.parse(strFromU8(files['manifest.json']))
      manifest.schemaVersion = version
      files['manifest.json'] = strToU8(JSON.stringify(manifest))
    })
    await expectRefused(file, 'invalid-version')
  })

  it('refuses a record count that disagrees with the manifest', async () => {
    const archive = await validArchive()
    const file = tamper(archive, (files) => {
      const manifest = JSON.parse(strFromU8(files['manifest.json']))
      manifest.counts.waypoints = 99
      files['manifest.json'] = strToU8(JSON.stringify(manifest))
    })
    await expectRefused(file, 'incomplete')
  })
})

describe('record validation and orphans', () => {
  it('reports invalid coordinates, orphan photos and duplicate ids instead of importing them', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    // Rebuild a coherent archive (manifest checksums included) with bad data.
    const files = unzipSync(await bytesFromBlob(blob))
    const waypoints = JSON.parse(strFromU8(files['data/waypoints.json']))
    waypoints.push({ ...waypoints[0], id: 'bad-lat', coordinate: { lat: 91, lng: 0 } })
    waypoints.push({ ...waypoints[0], id: 'bad-nan', coordinate: { lat: null, lng: 0 } })
    waypoints.push({ ...waypoints[0], id: 'wp-2' }) // duplicate id inside the backup
    files['data/waypoints.json'] = strToU8(JSON.stringify(waypoints))
    const photos = JSON.parse(strFromU8(files['data/photos.json']))
    photos.push({ ...photos[0], record: { ...photos[0].record, id: 'orphan', waypointId: 'ghost' } })
    photos.push({ ...photos[0], record: { ...photos[0].record, id: 'both', observationId: 'ob-1' } })
    files['data/photos.json'] = strToU8(JSON.stringify(photos))
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    const { crc32 } = await import('../core/crc32')
    for (const path of ['data/waypoints.json', 'data/photos.json']) {
      manifest.files[path] = { bytes: files[path].length, crc32: crc32(files[path]) }
    }
    manifest.counts.waypoints = waypoints.length
    manifest.counts.photos = photos.length
    files['manifest.json'] = strToU8(JSON.stringify(manifest))
    const file = new Blob([zipSync(files) as BlobPart])

    const target = newDb()
    const { plan, report } = await restoreAll(file, target)
    expect(plan.preview.waypoints).toMatchObject({ total: 5, new: 2, invalid: 3 })
    expect(plan.preview.photos).toMatchObject({ total: 5, new: 3, invalid: 2 })
    const reasons = report.invalid.map((i) => `${i.table}:${i.id}:${i.reason}`).join('\n')
    expect(reasons).toMatch(/waypoints:bad-lat.*coordonnées invalides/)
    expect(reasons).toMatch(/waypoints:bad-nan/)
    expect(reasons).toMatch(/waypoints:wp-2.*double/)
    expect(reasons).toMatch(/photos:orphan.*orpheline/)
    expect(reasons).toMatch(/photos:both/)
    expect(await target.table('waypoints').count()).toBe(2)
    expect(await target.table('photos').count()).toBe(3)
    expect(await target.table('waypoints').get('bad-lat')).toBeUndefined()
  })

  it('accepts older backups with missing optional fields and tables', async () => {
    const minimal = {
      format: 'ctr-hunting-backup',
      schemaVersion: 1,
      appVersion: '0.0.1',
      createdAt: '2026-01-01T00:00:00.000Z',
      counts: { waypoints: 1, observations: 1 },
      files: {} as Record<string, { bytes: number; crc32: number }>,
    }
    const { crc32 } = await import('../core/crc32')
    const waypointsJson = strToU8(
      JSON.stringify([
        {
          id: 'old-1',
          name: 'Ancien',
          coordinate: { lat: 46, lng: -71 },
          category: 'general',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )
    const observationsJson = strToU8(
      JSON.stringify([
        { id: 'old-o', coordinate: { lat: 46, lng: -71 }, timestamp: '2026-01-01T00:00:00.000Z' },
      ]),
    )
    minimal.files['data/waypoints.json'] = { bytes: waypointsJson.length, crc32: crc32(waypointsJson) }
    minimal.files['data/observations.json'] = { bytes: observationsJson.length, crc32: crc32(observationsJson) }
    const file = new Blob([
      zipSync({
        'manifest.json': strToU8(JSON.stringify(minimal)),
        'data/waypoints.json': waypointsJson,
        'data/observations.json': observationsJson,
      }) as BlobPart,
    ])
    const target = newDb()
    const { report } = await restoreAll(file, target)
    expect(report.invalid).toEqual([])
    expect(report.addedTotal).toBe(2)
    expect((await target.table('waypoints').get('old-1')).updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect((await target.table('observations').get('old-o')).notes).toBe('')
  })
})

describe('duplicates and conflicts', () => {
  it('ignores items that are identical to local ones (restoring twice adds nothing)', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    await restoreAll(blob, target)
    const before = await snapshot(target)

    const second = await restoreAll(blob, target)
    expect(second.report.addedTotal).toBe(0)
    expect(second.report.identicalIgnored).toBe(10)
    expect(second.report.conflicts).toEqual([])
    expect(await snapshot(target)).toEqual(before)
  })

  async function conflictSetup() {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    await seedEverything(target)
    // Local diverged: edited name+notes of wp-1, a different photo for ph-2.
    await target.table('waypoints').update('wp-1', { name: 'Poste modifié ici', notes: 'local' })
    const otherPhoto = blobOf(randomBytes(1500, 99))
    await target.table('photos').update('ph-2', { blob: otherPhoto, originalBlob: otherPhoto })
    return { blob, target }
  }

  it('keep-local (default): local items stay exactly as they are and conflicts are listed', async () => {
    const { blob, target } = await conflictSetup()
    const before = await snapshot(target)
    const { plan, report } = await restoreAll(blob, target, 'keep-local')
    expect(plan.preview.waypoints).toMatchObject({ identical: 1, conflict: 1, new: 0 })
    expect(plan.preview.photos).toMatchObject({ conflict: 1, identical: 2 })
    expect(report.addedTotal).toBe(0)
    expect(report.conflicts.map((c) => `${c.table}:${c.id}:${c.resolution}`).sort()).toEqual([
      'photos:ph-2:kept-local',
      'waypoints:wp-1:kept-local',
    ])
    expect(await snapshot(target)).toEqual(before)
  })

  it('keep-both: adds the imported version as a marked copy under a new id, local untouched', async () => {
    const { blob, target } = await conflictSetup()
    const localWp = await target.table('waypoints').get('wp-1')
    const { report } = await restoreAll(blob, target, 'keep-both')

    expect(report.conflicts.every((c) => c.resolution === 'copy-added' && c.newId)).toBe(true)
    // Local waypoint: identical, coordinates untouched.
    expect(await target.table('waypoints').get('wp-1')).toEqual(localWp)

    const waypoints = await target.table('waypoints').toArray()
    expect(waypoints).toHaveLength(3)
    const copy = waypoints.find((w) => w.name === 'Poste du ruisseau (importé)')!
    expect(copy.id).not.toBe('wp-1')
    expect(copy.coordinate).toEqual(localWp.coordinate) // imported coords are the original ones
    expect(copy.notes).toContain('<b>gras</b>')

    // The conflicting photo ph-2 was copied too, and follows the copy of its parent wp-1.
    const photos = await target.table('photos').toArray()
    expect(photos).toHaveLength(4)
    const copiedPhotos = photos.filter((p) => p.waypointId === copy.id)
    expect(copiedPhotos).toHaveLength(1)
    expect(copiedPhotos[0].id).not.toBe('ph-2')
    // the local (diverged) photo ph-2 is untouched
    expect(photos.find((p) => p.id === 'ph-2')!.waypointId).toBe('wp-1')
  })

  it('keep-both: children of a copied parent follow the copy', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    // Local has the SAME waypoint id with other content and none of its photos.
    await target.table('waypoints').add({
      id: 'wp-1',
      name: 'Autre',
      coordinate: { lat: 10, lng: 10 },
      category: 'general',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    const { report } = await restoreAll(blob, target, 'keep-both')
    const copy = (await target.table('waypoints').toArray()).find((w) => w.name.endsWith('(importé)'))!
    expect(copy.id).not.toBe('wp-1')
    expect((await target.table('waypoints').get('wp-1')).coordinate).toEqual({ lat: 10, lng: 10 })
    const photos = await target.table('photos').toArray()
    const own = photos.filter((p) => p.waypointId === copy.id)
    expect(own.map((p) => p.id).sort()).toEqual(['ph-1', 'ph-2'])
    // the observation of wp-1 now points at the copy as well
    expect((await target.table('observations').get('ob-1')).waypointId).toBe(copy.id)
    expect(report.invalid).toEqual([])
  })

  it('restores onto a populated database without losing anything or touching coordinates', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })

    const target = newDb()
    await target.table('waypoints').bulkAdd([
      {
        id: 'local-a',
        name: 'Déjà là',
        coordinate: { lat: 45.5, lng: -72.5 },
        category: 'water',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ])
    await target.table('tracks').add({
      id: 'local-t',
      name: 'Locale',
      startedAt: '2026-08-02T00:00:00.000Z',
      points: [{ lat: 45.5, lng: -72.5, timestamp: '2026-08-02T00:00:00.000Z' }],
    })
    const before = {
      wp: await target.table('waypoints').get('local-a'),
      tr: await target.table('tracks').get('local-t'),
    }
    const { report } = await restoreAll(blob, target)
    expect(report.addedTotal).toBe(10)
    expect(await target.table('waypoints').count()).toBe(3)
    expect(await target.table('waypoints').get('local-a')).toEqual(before.wp)
    expect(await target.table('tracks').get('local-t')).toEqual(before.tr)
    expect(await target.table('tracks').count()).toBe(2)
  })

  it('never overwrites a settings value: a different local value is a kept-local conflict', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    await target.table('settings').add({ key: 'fieldModeEnabled', value: false })
    const { report } = await restoreAll(blob, target, 'keep-both')
    expect((await target.table('settings').get('fieldModeEnabled')).value).toBe(false)
    expect(report.conflicts.find((c) => c.table === 'settings')?.resolution).toBe('kept-local')
  })
})

describe('atomic write', () => {
  it('rolls everything back when a write fails in the middle of the transaction', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })

    const target = newDb()
    await target.table('waypoints').add({
      id: 'keep-me',
      name: 'Existant',
      coordinate: { lat: 46.5, lng: -71.5 },
      category: 'general',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })
    const before = await snapshot(target)

    const parsed = await readBackup(blob)
    const plan = await planRestore(parsed, { database: target })
    // Inject a failure AFTER territories/waypoints/tracks were really written
    // inside the transaction: observations fail.
    const observations = target.table('observations')
    const spy = vi.spyOn(observations, 'bulkAdd').mockImplementation((async () => {
      // Really mid-transaction: the waypoints of the archive are already visible here.
      expect(await target.table('waypoints').count()).toBeGreaterThan(1)
      throw new Error('panne injectée')
    }) as unknown as typeof observations.bulkAdd)

    await expect(applyRestore(plan, { database: target })).rejects.toBeInstanceOf(RestoreWriteError)
    await expect(applyRestore(plan, { database: target })).rejects.toThrow(/aucune donnée n’a été ajoutée/)
    expect(spy).toHaveBeenCalled()
    expect(await snapshot(target)).toEqual(before)
    spy.mockRestore()

    // And it works afterwards (no leftovers blocking a retry).
    const retry = await applyRestore(plan, { database: target })
    expect(retry.addedTotal).toBe(10)
  })

  it('fails (and rolls back) instead of overwriting when an id collides after the preview', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const target = newDb()
    const plan = await planRestore(await readBackup(blob), { database: target })
    // Someone adds wp-1 locally between the preview and the confirmation.
    await target.table('waypoints').add({
      id: 'wp-1',
      name: 'Arrivé entre-temps',
      coordinate: { lat: 1, lng: 2 },
      category: 'general',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    })
    await expect(applyRestore(plan, { database: target })).rejects.toBeInstanceOf(RestoreWriteError)
    expect((await target.table('waypoints').get('wp-1')).coordinate).toEqual({ lat: 1, lng: 2 })
    expect(await target.table('tracks').count()).toBe(0)
    expect(await target.table('photos').count()).toBe(0)
  })
})

describe('cancellation and progress', () => {
  it('cancels a backup in progress with BackupCancelledError', async () => {
    const source = newDb()
    await seedEverything(source)
    const controller = new AbortController()
    await expect(
      createBackup({
        database: source,
        signal: controller.signal,
        onProgress: (p) => {
          if (p.phase === 'Photos') controller.abort()
        },
      }),
    ).rejects.toBeInstanceOf(BackupCancelledError)
  })

  it('cancels a restore preview before anything is written', async () => {
    const source = newDb()
    await seedEverything(source)
    const { blob } = await createBackup({ database: source })
    const controller = new AbortController()
    controller.abort()
    await expect(readBackup(blob, { signal: controller.signal })).rejects.toBeInstanceOf(
      BackupCancelledError,
    )
    const target = newDb()
    const plan = await planRestore(await readBackup(blob), { database: target })
    await expect(
      applyRestore(plan, { database: target, signal: controller.signal }),
    ).rejects.toBeInstanceOf(BackupCancelledError)
    expect(await target.table('waypoints').count()).toBe(0)
  })

  it('reports progress while backing up', async () => {
    const source = newDb()
    await seedEverything(source)
    const phases: string[] = []
    await createBackup({ database: source, onProgress: (p) => phases.push(p.phase) })
    expect(phases).toContain('Photos')
    expect(phases.at(-1)).toBe('Terminé')
  })
})
