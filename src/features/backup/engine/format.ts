import type Dexie from 'dexie'
import type { Table } from 'dexie'

/**
 * Archive format constants and manifest types. The full description of the
 * format (and the duplicate policy) is in `docs/BACKUP_FORMAT.md`.
 */
export const BACKUP_FORMAT = 'ctr-hunting-backup'

/** Format version written by this build. A reader refuses anything greater
 * (it cannot know what it would be dropping) and anything that is not a
 * positive integer. Bump it only for a change an older reader would
 * misinterpret; purely additive fields do not need a bump. */
export const BACKUP_SCHEMA_VERSION = 1

/** Hard limits applied BEFORE anything is decompressed or written. */
export const MAX_BACKUP_FILE_BYTES = 1024 * 1024 * 1024
export const MAX_ENTRY_BYTES = 256 * 1024 * 1024
export const MAX_ENTRY_COUNT = 100_000

/**
 * Tables that go into a backup, in write order (parents before children).
 * `territories` only exists from Dexie schema v5: the engine includes each
 * table only if the open database actually has it.
 */
export const BACKUP_TABLES = [
  'territories',
  'waypoints',
  'tracks',
  'observations',
  'photos',
  'offlineAreas',
  'settings',
] as const

export type BackupTableName = (typeof BACKUP_TABLES)[number]

/** Tables deliberately NOT saved. A test fails if a database table is in
 * neither list, so a future table cannot be forgotten silently. */
export const EXCLUDED_TABLES = ['syncQueue'] as const

/** User preferences worth carrying to another device. A WHITELIST: weather
 * cache, reminders and any future key stay out until added here on purpose,
 * which is also what keeps secrets out of an archive. */
export const BACKUP_SETTING_KEYS: readonly string[] = ['fieldModeEnabled']

const SECRET_KEY_PATTERN = /key|token|secret|password|passwd|auth|credential/i

export function isBackupSettingKey(key: string): boolean {
  return BACKUP_SETTING_KEYS.includes(key) && !SECRET_KEY_PATTERN.test(key)
}

export interface ManifestFileEntry {
  bytes: number
  crc32: number
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT
  schemaVersion: number
  appVersion: string
  /** Dexie schema version of the database that produced the archive. */
  databaseVersion: number
  createdAt: string // ISO 8601
  /** Number of records per saved table. */
  counts: Partial<Record<BackupTableName, number>>
  /** Length and CRC-32 of every other file of the archive. */
  files: Record<string, ManifestFileEntry>
  /** Honest, human-readable limits of this archive. */
  limitations: string[]
}

export const BACKUP_LIMITATIONS: string[] = [
  'Zones hors ligne : seules les métadonnées (nom, étendue, zooms) sont sauvegardées, jamais les tuiles de carte. Elles sont à retélécharger.',
  'La file de synchronisation (syncQueue) n’est pas sauvegardée.',
  'Seules les préférences utilisateur connues sont sauvegardées ; aucun secret ni clé d’API.',
]

export function dataPath(table: BackupTableName): string {
  return `data/${table}.json`
}

export const MANIFEST_PATH = 'manifest.json'

/** A photo's entry in `data/photos.json`: the record without its Blobs, plus
 * where the bytes are. `original: null` means « originalBlob has the same
 * bytes as blob » (the usual case: no in-app editing). */
export interface PhotoArchiveEntry {
  record: Record<string, unknown>
  blob: { path: string; type: string }
  original: { path: string; type: string } | null
}

/** Tables of `database` that this build can back up. */
export function availableBackupTables(database: Dexie): BackupTableName[] {
  const names = new Set(database.tables.map((table) => table.name))
  return BACKUP_TABLES.filter((name) => names.has(name))
}

export function getTable(database: Dexie, name: BackupTableName): Table {
  return database.table(name)
}
