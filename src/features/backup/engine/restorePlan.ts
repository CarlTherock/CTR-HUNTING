import type Dexie from 'dexie'
import type { Table } from 'dexie'
import { db } from '@/database/db'
import { crc32 } from '../core/crc32'
import { stableStringify } from '../core/stable'
import { createYielder, type RunOptions } from '../core/tasks'
import type { ParsedBackup } from './backupRead'
import {
  BACKUP_LIMITATIONS,
  BACKUP_TABLES,
  availableBackupTables,
  type BackupManifest,
  type BackupTableName,
} from './format'
import {
  validatePhotoEntry,
  validateRecord,
  validateSetting,
  type ValidatedPhoto,
} from './validate'

/**
 * Restore step 2 — PLAN. Classifies every backed-up item against the local
 * database, READ-ONLY. Nothing is written until `applyRestore`, which only
 * runs after the user has seen this plan and confirmed.
 *
 * Duplicate policy (see docs/BACKUP_FORMAT.md):
 *  - same id, same content  → `identical`: ignored;
 *  - same id, other content → `conflict`: the local item is kept untouched;
 *    the user decides in the preview whether the imported version is also
 *    added as a copy under a new id (default: no);
 *  - invalid / orphan       → `invalid`: reported, never imported;
 *  - table unknown to this build → `unsupported`.
 */
export type ItemStatus = 'new' | 'identical' | 'conflict' | 'invalid' | 'unsupported'

type Rec = Record<string, unknown>

export interface PlannedItem {
  table: BackupTableName
  /** Record id (settings: the key). */
  id: string
  label: string
  status: ItemStatus
  reason?: string
  /** Validated record (not for photos, see `photo`). */
  record?: Rec
  photo?: ValidatedPhoto
}

export interface TablePreview {
  total: number
  new: number
  identical: number
  conflict: number
  invalid: number
  unsupported: number
}

export interface RestorePlan {
  manifest: Pick<
    BackupManifest,
    'schemaVersion' | 'appVersion' | 'createdAt' | 'databaseVersion'
  >
  items: PlannedItem[]
  preview: Partial<Record<BackupTableName, TablePreview>>
  totals: TablePreview
  limitations: string[]
}

function emptyPreview(): TablePreview {
  return { total: 0, new: 0, identical: 0, conflict: 0, invalid: 0, unsupported: 0 }
}

const CHUNK = 200

async function bulkGetChunked(
  table: Table,
  keys: string[],
  tick: () => Promise<void>,
): Promise<Map<string, Rec>> {
  const found = new Map<string, Rec>()
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK)
    const rows = (await table.bulkGet(slice)) as (Rec | undefined)[]
    rows.forEach((row, index) => {
      if (row) found.set(slice[index], row)
    })
    await tick()
  }
  return found
}

/** Fields that identify an offline area. Its download state (status, tile
 * counts, tile URLs) is device-specific and not part of the comparison. */
function offlineAreaIdentity(record: Rec): Rec {
  return {
    id: record.id,
    name: record.name,
    bounds: record.bounds,
    minZoom: record.minZoom,
    maxZoom: record.maxZoom,
    baseLayer: record.baseLayer,
    createdAt: record.createdAt,
  }
}

function sameRecord(table: BackupTableName, local: Rec, incoming: Rec): boolean {
  if (table === 'offlineAreas') {
    return (
      stableStringify(offlineAreaIdentity(local)) ===
      stableStringify(offlineAreaIdentity(incoming))
    )
  }
  return stableStringify(local) === stableStringify(incoming)
}

async function bytesOf(blob: unknown): Promise<Uint8Array | null> {
  try {
    if (!(blob instanceof Blob)) return null
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}

async function samePhoto(local: Rec, incoming: ValidatedPhoto): Promise<boolean> {
  const { blob, originalBlob, ...localMeta } = local
  if (stableStringify(localMeta) !== stableStringify(incoming.record)) return false
  const localBlob = await bytesOf(blob)
  if (
    !localBlob ||
    localBlob.length !== incoming.blobBytes.length ||
    (blob as Blob).type !== incoming.blobType ||
    crc32(localBlob) !== crc32(incoming.blobBytes)
  ) {
    return false
  }
  const wantedOriginal = incoming.originalBytes ?? incoming.blobBytes
  const localOriginal = originalBlob === blob ? localBlob : await bytesOf(originalBlob)
  if (!localOriginal || localOriginal.length !== wantedOriginal.length) return false
  if (crc32(localOriginal) !== crc32(wantedOriginal)) return false
  return true
}

export async function planRestore(
  parsed: ParsedBackup,
  options: RunOptions & { database?: Dexie } = {},
): Promise<RestorePlan> {
  const database = options.database ?? db
  const { signal, onProgress } = options
  const yielder = createYielder(signal)
  const supported = new Set(availableBackupTables(database))
  const items: PlannedItem[] = []
  const seen = new Map<BackupTableName, Set<string>>()
  const markSeen = (table: BackupTableName, id: string): boolean => {
    let ids = seen.get(table)
    if (!ids) seen.set(table, (ids = new Set()))
    if (ids.has(id)) return false
    ids.add(id)
    return true
  }

  // 1. Shape / range validation of every record.
  const tablesInBackup = BACKUP_TABLES.filter((t) => parsed.tables[t] !== undefined)
  let step = 0
  for (const table of tablesInBackup) {
    onProgress?.({ phase: 'Validation', done: step++, total: tablesInBackup.length })
    const rows = parsed.tables[table] ?? []
    for (const raw of rows) {
      await yielder.tick()
      const guessedId =
        raw !== null && typeof raw === 'object'
          ? String(
              (raw as Rec).id ??
                (raw as Rec).key ??
                ((raw as Rec).record as Rec | undefined)?.id ??
                '?',
            )
          : '?'
      if (!supported.has(table)) {
        items.push({
          table,
          id: guessedId,
          label: guessedId,
          status: 'unsupported',
          reason: 'données non prises en charge par cette version de l’application',
        })
        continue
      }
      if (table === 'settings') {
        const result = validateSetting(raw)
        if (!result.ok) {
          items.push({ table, id: guessedId, label: guessedId, status: 'invalid', reason: result.reason })
        } else {
          items.push({
            table,
            id: result.value.key,
            label: result.value.key,
            status: 'new',
            record: { key: result.value.key, value: result.value.value },
          })
        }
      } else if (table === 'photos') {
        const result = validatePhotoEntry(raw, parsed.media)
        if (!result.ok) {
          items.push({ table, id: guessedId, label: 'Photo', status: 'invalid', reason: result.reason })
        } else {
          items.push({
            table,
            id: result.value.id,
            label: 'Photo',
            status: 'new',
            photo: result.value,
          })
        }
      } else {
        const result = validateRecord(table, raw)
        if (!result.ok) {
          items.push({ table, id: guessedId, label: guessedId, status: 'invalid', reason: result.reason })
        } else {
          items.push({
            table,
            id: result.value.id,
            label: result.value.label,
            status: 'new',
            record: result.value.record,
          })
        }
      }
      const last = items[items.length - 1]
      if (last.status === 'new' && !markSeen(table, last.id)) {
        last.status = 'invalid'
        last.reason = 'identifiant en double dans la sauvegarde'
        delete last.record
        delete last.photo
      }
    }
  }

  // 2. Orphan photos: a photo needs a parent, in the backup or already here.
  if (supported.has('photos')) {
    const backupParents = {
      waypointId: new Set(
        items.filter((i) => i.table === 'waypoints' && i.status !== 'invalid').map((i) => i.id),
      ),
      observationId: new Set(
        items.filter((i) => i.table === 'observations' && i.status !== 'invalid').map((i) => i.id),
      ),
    }
    const photoItems = items.filter((i) => i.table === 'photos' && i.status === 'new')
    const needLocal = { waypointId: new Set<string>(), observationId: new Set<string>() }
    for (const item of photoItems) {
      const ownerKey = item.photo!.record.waypointId !== undefined ? 'waypointId' : 'observationId'
      const owner = String(item.photo!.record[ownerKey])
      if (!backupParents[ownerKey].has(owner)) needLocal[ownerKey].add(owner)
    }
    const localWaypoints = await bulkGetChunked(
      database.table('waypoints'),
      [...needLocal.waypointId],
      yielder.tick,
    )
    const localObservations = await bulkGetChunked(
      database.table('observations'),
      [...needLocal.observationId],
      yielder.tick,
    )
    for (const item of photoItems) {
      const ownerKey = item.photo!.record.waypointId !== undefined ? 'waypointId' : 'observationId'
      const owner = String(item.photo!.record[ownerKey])
      const local = ownerKey === 'waypointId' ? localWaypoints : localObservations
      if (!backupParents[ownerKey].has(owner) && !local.has(owner)) {
        item.status = 'invalid'
        item.reason =
          ownerKey === 'waypointId'
            ? 'photo orpheline : son point de repère n’existe ni dans la sauvegarde ni ici'
            : 'photo orpheline : son entrée de journal n’existe ni dans la sauvegarde ni ici'
        delete item.photo
      }
    }
  }

  // 3. Compare with what is already here (read-only).
  step = 0
  for (const table of tablesInBackup) {
    if (!supported.has(table)) continue
    onProgress?.({ phase: 'Comparaison', done: step++, total: tablesInBackup.length })
    const candidates = items.filter((i) => i.table === table && i.status === 'new')
    const localRows = await bulkGetChunked(
      database.table(table),
      candidates.map((i) => i.id),
      yielder.tick,
    )
    for (const item of candidates) {
      await yielder.tick()
      const local = localRows.get(item.id)
      if (!local) continue
      let same: boolean
      if (table === 'photos') same = await samePhoto(local, item.photo!)
      else if (table === 'settings') {
        same = stableStringify(local.value) === stableStringify(item.record!.value)
      } else same = sameRecord(table, local, item.record!)
      item.status = same ? 'identical' : 'conflict'
    }
  }

  // 4. Preview counts.
  const preview: RestorePlan['preview'] = {}
  const totals = emptyPreview()
  for (const item of items) {
    const entry = (preview[item.table] ??= emptyPreview())
    entry.total++
    entry[item.status]++
    totals.total++
    totals[item.status]++
  }
  return {
    manifest: {
      schemaVersion: parsed.manifest.schemaVersion,
      appVersion: parsed.manifest.appVersion,
      createdAt: parsed.manifest.createdAt,
      databaseVersion: parsed.manifest.databaseVersion,
    },
    items,
    preview,
    totals,
    limitations: parsed.manifest.limitations.length
      ? parsed.manifest.limitations
      : BACKUP_LIMITATIONS,
  }
}
