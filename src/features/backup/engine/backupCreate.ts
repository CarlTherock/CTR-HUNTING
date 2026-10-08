import type Dexie from 'dexie'
import { db } from '@/database/db'
import type { Photo } from '@/types'
import { crc32 } from '../core/crc32'
import { createYielder, throwIfAborted, type RunOptions } from '../core/tasks'
import { APP_VERSION } from './appInfo'
import {
  BACKUP_FORMAT,
  BACKUP_LIMITATIONS,
  BACKUP_SCHEMA_VERSION,
  MANIFEST_PATH,
  availableBackupTables,
  dataPath,
  isBackupSettingKey,
  type BackupManifest,
  type BackupTableName,
  type ManifestFileEntry,
  type PhotoArchiveEntry,
} from './format'

export interface CreateBackupOptions extends RunOptions {
  database?: Dexie
  now?: Date
  appVersion?: string
}

export interface CreateBackupResult {
  blob: Blob
  fileName: string
  manifest: BackupManifest
  photoCount: number
  totalPhotoBytes: number
}

const JSON_CHUNK_BYTES = 256 * 1024

/** `ctr-hunting-sauvegarde-2026-10-07-1342.zip` (local time). */
export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `ctr-hunting-sauvegarde-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}.zip`
  )
}

/**
 * Builds a complete, versioned backup archive (ZIP, see `format.ts`) of the
 * local database. Read-only with respect to the database. The `fflate`
 * library is imported dynamically here, so it is only downloaded and parsed
 * when the user actually saves or restores.
 */
export async function createBackup(
  options: CreateBackupOptions = {},
): Promise<CreateBackupResult> {
  const database = options.database ?? db
  const now = options.now ?? new Date()
  const { signal, onProgress } = options
  const yielder = createYielder(signal)
  const tables = availableBackupTables(database)

  onProgress?.({ phase: 'Lecture des données', done: 0, total: 1 })
  const { Zip, ZipDeflate, ZipPassThrough, strToU8 } = await import('fflate')
  throwIfAborted(signal)

  // One read-only transaction = one consistent snapshot. Photo records hold
  // Blob handles, not bytes: the bytes are read later, one photo at a time.
  const snapshot: Partial<Record<BackupTableName, Record<string, unknown>[]>> = {}
  await database.transaction(
    'r',
    tables.map((name) => database.table(name)),
    async () => {
      for (const name of tables) {
        snapshot[name] = (await database.table(name).toArray()) as Record<
          string,
          unknown
        >[]
      }
    },
  )
  throwIfAborted(signal)

  const settingRows = (snapshot.settings ?? []).filter((row) =>
    isBackupSettingKey(String(row.key)),
  )
  if (snapshot.settings) snapshot.settings = settingRows

  const parts: Uint8Array[] = []
  let zipError: Error | null = null
  const zip = new Zip((error, chunk) => {
    if (error) zipError = error
    else parts.push(chunk)
  })

  const files: Record<string, ManifestFileEntry> = {}
  const counts: Partial<Record<BackupTableName, number>> = {}
  const photoRows = (snapshot.photos ?? []) as unknown as Photo[]
  const jsonTables = tables.filter((name) => name !== 'photos')
  const totalSteps = jsonTables.length + 1 + photoRows.length
  let step = 0
  const report = (phase: string) => onProgress?.({ phase, done: step, total: totalSteps })

  /** Adds a compressed JSON file, pushed in slices so the thread stays free. */
  async function addJson(path: string, text: string): Promise<void> {
    const bytes = strToU8(text)
    const file = new ZipDeflate(path, { level: 6 })
    zip.add(file)
    if (bytes.length === 0) file.push(bytes, true)
    for (let offset = 0; offset < bytes.length; offset += JSON_CHUNK_BYTES) {
      const end = Math.min(offset + JSON_CHUNK_BYTES, bytes.length)
      file.push(bytes.subarray(offset, end), end >= bytes.length)
      await yielder.tick()
    }
    files[path] = { bytes: bytes.length, crc32: crc32(bytes) }
  }

  /** Photos (JPEG/PNG/WebP) are already compressed: stored as-is. */
  function addMedia(path: string, bytes: Uint8Array): void {
    const file = new ZipPassThrough(path)
    zip.add(file)
    file.push(bytes, true)
    files[path] = { bytes: bytes.length, crc32: crc32(bytes) }
  }

  for (const name of jsonTables) {
    report(tableLabel(name))
    const rows = snapshot[name] ?? []
    counts[name] = rows.length
    await addJson(dataPath(name), await stringifyRows(rows, yielder.tick))
    step++
  }

  // Photos: metadata in JSON, bytes as separate stored entries.
  let totalPhotoBytes = 0
  const photoEntries: PhotoArchiveEntry[] = []
  if (tables.includes('photos')) {
    for (let index = 0; index < photoRows.length; index++) {
      report('Photos')
      const photo = photoRows[index]
      const name = String(index + 1).padStart(6, '0')
      const blobBytes = new Uint8Array(await photo.blob.arrayBuffer())
      let originalBytes: Uint8Array | null = null
      if (photo.originalBlob !== photo.blob) {
        const candidate = new Uint8Array(await photo.originalBlob.arrayBuffer())
        if (!sameBytes(candidate, blobBytes)) originalBytes = candidate
      }
      const record: Record<string, unknown> = { ...photo }
      delete record.blob
      delete record.originalBlob
      const blobPath = `media/photos/${name}.bin`
      addMedia(blobPath, blobBytes)
      totalPhotoBytes += blobBytes.length
      let original: PhotoArchiveEntry['original'] = null
      if (originalBytes) {
        const originalPath = `media/photos/${name}.original.bin`
        addMedia(originalPath, originalBytes)
        totalPhotoBytes += originalBytes.length
        original = { path: originalPath, type: photo.originalBlob.type }
      }
      photoEntries.push({
        record,
        blob: { path: blobPath, type: photo.blob.type },
        original,
      })
      step++
      await yielder.tick()
    }
    counts.photos = photoRows.length
    await addJson(dataPath('photos'), JSON.stringify(photoEntries))
    step++
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: options.appVersion ?? APP_VERSION,
    databaseVersion: database.verno,
    createdAt: now.toISOString(),
    counts,
    files,
    limitations: BACKUP_LIMITATIONS,
  }
  report('Finalisation')
  const manifestFile = new ZipDeflate(MANIFEST_PATH, { level: 6 })
  zip.add(manifestFile)
  manifestFile.push(strToU8(JSON.stringify(manifest, null, 2)), true)
  zip.end()
  if (zipError) throw zipError
  throwIfAborted(signal)

  const blob = new Blob(parts as BlobPart[], { type: 'application/zip' })
  onProgress?.({ phase: 'Terminé', done: totalSteps, total: totalSteps })
  return {
    blob,
    fileName: backupFileName(now),
    manifest,
    photoCount: photoRows.length,
    totalPhotoBytes,
  }
}

function tableLabel(name: BackupTableName): string {
  const labels: Record<BackupTableName, string> = {
    territories: 'Territoires',
    bloodSessions: 'Recherches de sang',
    waypoints: 'Points de repère',
    tracks: 'Traces',
    observations: 'Journal',
    photos: 'Photos',
    offlineAreas: 'Zones hors ligne',
    settings: 'Réglages',
  }
  return labels[name]
}

/** `[rec,rec,…]` built record by record so a big table does not freeze the UI. */
async function stringifyRows(
  rows: unknown[],
  tick: () => Promise<void>,
): Promise<string> {
  const pieces: string[] = []
  for (const row of rows) {
    pieces.push(JSON.stringify(row))
    await tick()
  }
  return `[${pieces.join(',')}]`
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
