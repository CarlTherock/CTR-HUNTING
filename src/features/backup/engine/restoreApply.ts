import type Dexie from 'dexie'
import { db } from '@/database/db'
import { createYielder, throwIfAborted, type RunOptions } from '../core/tasks'
import { BACKUP_TABLES, type BackupTableName } from './format'
import type { PlannedItem, RestorePlan } from './restorePlan'

/**
 * Restore step 3 — APPLY (only after the user confirmed the preview).
 *
 * Guarantees, each covered by a test:
 *  - nothing is deleted, nothing existing is modified: records are only ever
 *    ADDED (`bulkAdd`, never `put`), so a local waypoint keeps its exact
 *    coordinates, and an id collision that slipped past the plan makes the
 *    transaction fail instead of overwriting;
 *  - one single Dexie transaction: if anything fails part-way, IndexedDB rolls
 *    everything back — no half-restored database;
 *  - everything that can be prepared (copies, remapped ids, Blobs) is prepared
 *    BEFORE the transaction, so the transaction itself is short and has no
 *    awaits on foreign promises (which would auto-commit it early).
 */
export type ConflictMode = 'keep-local' | 'keep-both'

export interface ConflictEntry {
  table: BackupTableName
  id: string
  label: string
  resolution: 'kept-local' | 'copy-added'
  /** Id of the copy when `resolution` is `copy-added`. */
  newId?: string
}

export interface InvalidEntry {
  table: BackupTableName
  id: string
  label: string
  reason: string
}

export interface RestoreReport {
  mode: ConflictMode
  added: Partial<Record<BackupTableName, number>>
  addedTotal: number
  identicalIgnored: number
  conflicts: ConflictEntry[]
  invalid: InvalidEntry[]
  unsupported: number
  durationMs: number
}

export class RestoreWriteError extends Error {
  readonly causeError: unknown
  constructor(cause: unknown) {
    const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : ''
    const quota =
      cause instanceof Error && cause.name === 'QuotaExceededError'
        ? ' Espace de stockage insuffisant sur cet appareil.'
        : ''
    super(
      `La restauration a échoué pendant l’écriture${detail}.${quota} Elle a été annulée en bloc : aucune donnée n’a été ajoutée ni modifiée.`,
    )
    this.name = 'RestoreWriteError'
    this.causeError = cause
  }
}

type Rec = Record<string, unknown>

export interface ApplyRestoreOptions extends RunOptions {
  database?: Dexie
  mode?: ConflictMode
  /** Injectable for tests; defaults to `crypto.randomUUID`. */
  newId?: () => string
}

const IMPORTED_MARK = ' (importé)'

export async function applyRestore(
  plan: RestorePlan,
  options: ApplyRestoreOptions = {},
): Promise<RestoreReport> {
  const database = options.database ?? db
  const mode = options.mode ?? 'keep-local'
  const newId = options.newId ?? (() => crypto.randomUUID())
  const { signal, onProgress } = options
  const started = Date.now()
  const yielder = createYielder(signal)

  const copies = mode === 'keep-both'
  // Which conflicting items get a copy (settings cannot: one value per key).
  const isCopied = (item: PlannedItem) =>
    copies && item.status === 'conflict' && item.table !== 'settings'

  // Old id -> copy id, per table, so children follow the copy of their parent.
  const idMap: Partial<Record<BackupTableName, Map<string, string>>> = {}
  for (const item of plan.items) {
    if (isCopied(item)) (idMap[item.table] ??= new Map()).set(item.id, newId())
  }
  const remap = (table: BackupTableName, id: unknown): unknown =>
    typeof id === 'string' ? (idMap[table]?.get(id) ?? id) : id

  const writes: Partial<Record<BackupTableName, Rec[]>> = {}
  const conflicts: ConflictEntry[] = []
  const invalid: InvalidEntry[] = []
  let identicalIgnored = 0
  let unsupported = 0
  const added: Partial<Record<BackupTableName, number>> = {}

  let index = 0
  for (const item of plan.items) {
    index++
    onProgress?.({ phase: 'Préparation', done: index, total: plan.items.length })
    await yielder.tick()
    if (item.status === 'invalid') {
      invalid.push({
        table: item.table,
        id: item.id,
        label: item.label,
        reason: item.reason ?? 'invalide',
      })
      continue
    }
    if (item.status === 'unsupported') {
      unsupported++
      continue
    }
    if (item.status === 'identical') {
      identicalIgnored++
      continue
    }
    const copy = isCopied(item)
    if (item.status === 'conflict') {
      conflicts.push({
        table: item.table,
        id: item.id,
        label: item.label,
        resolution: copy ? 'copy-added' : 'kept-local',
        newId: copy ? idMap[item.table]?.get(item.id) : undefined,
      })
      if (!copy) continue
    }
    const row = buildRow(
      item,
      copy ? (idMap[item.table]?.get(item.id) ?? null) : null,
      remap,
    )
    ;(writes[item.table] ??= []).push(row)
    added[item.table] = (added[item.table] ?? 0) + 1
  }

  const writtenTables = BACKUP_TABLES.filter((t) => (writes[t]?.length ?? 0) > 0)
  throwIfAborted(signal) // last chance to cancel: the transaction is not interruptible.
  if (writtenTables.length > 0) {
    onProgress?.({ phase: 'Écriture', done: 0, total: writtenTables.length })
    try {
      await database.transaction(
        'rw',
        writtenTables.map((t) => database.table(t)),
        async () => {
          for (const table of writtenTables) {
            await database.table(table).bulkAdd(writes[table] ?? [])
          }
        },
      )
    } catch (error) {
      throw new RestoreWriteError(error)
    }
  }
  onProgress?.({ phase: 'Terminé', done: 1, total: 1 })

  return {
    mode,
    added,
    addedTotal: Object.values(added).reduce((sum, n) => sum + n, 0),
    identicalIgnored,
    conflicts,
    invalid,
    unsupported,
    durationMs: Date.now() - started,
  }
}

function buildRow(
  item: PlannedItem,
  copyId: string | null,
  remap: (table: BackupTableName, id: unknown) => unknown,
): Rec {
  if (item.table === 'photos') {
    const photo = item.photo
    if (!photo) throw new Error(`Photo ${item.id} sans données`)
    const row: Rec = { ...photo.record }
    if (copyId) row.id = copyId
    if (row.waypointId !== undefined) row.waypointId = remap('waypoints', row.waypointId)
    if (row.observationId !== undefined) {
      row.observationId = remap('observations', row.observationId)
    }
    const blob = new Blob([photo.blobBytes as BlobPart], { type: photo.blobType })
    row.blob = blob
    row.originalBlob = photo.originalBytes
      ? new Blob([photo.originalBytes as BlobPart], { type: photo.originalType })
      : blob
    return row
  }
  const row: Rec = { ...item.record }
  if (item.table === 'settings') return row
  if (copyId) row.id = copyId
  if (row.territoryId !== undefined)
    row.territoryId = remap('territories', row.territoryId)
  // Links of a blood-search session follow the ids a copy may have been given.
  if (
    (item.table === 'waypoints' || item.table === 'tracks') &&
    row.sessionId !== undefined
  ) {
    row.sessionId = remap('bloodSessions', row.sessionId)
  }
  if (item.table === 'bloodSessions' && row.trackId !== undefined) {
    row.trackId = remap('tracks', row.trackId)
  }
  if (item.table === 'waypoints' || item.table === 'observations') {
    if (Array.isArray(row.photoIds)) {
      row.photoIds = row.photoIds.map((id: unknown) => remap('photos', id))
    }
  }
  if (item.table === 'observations' && row.waypointId !== undefined) {
    row.waypointId = remap('waypoints', row.waypointId)
  }
  if (item.table === 'offlineAreas') {
    // Only the metadata travels: the tiles stay on the original device.
    row.status = 'interrupted'
    row.tilesDownloaded = 0
    row.bytesDownloaded = 0
    row.tileUrls = []
    delete row.summary
    delete row.completedAt
    delete row.lastError
  }
  if (copyId) {
    if (item.table === 'observations') {
      row.notes = `${typeof row.notes === 'string' ? row.notes : ''}\n(importé)`.trim()
    } else if (typeof row.name === 'string') {
      row.name = `${row.name}${IMPORTED_MARK}`
    }
  }
  return row
}
