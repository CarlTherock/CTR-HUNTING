import { crc32 } from '../core/crc32'
import { createYielder, throwIfAborted, type RunOptions } from '../core/tasks'
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BACKUP_TABLES,
  MANIFEST_PATH,
  MAX_BACKUP_FILE_BYTES,
  MAX_ENTRY_BYTES,
  MAX_ENTRY_COUNT,
  dataPath,
  type BackupManifest,
  type BackupTableName,
  type ManifestFileEntry,
} from './format'

export type BackupErrorCode =
  | 'too-large'
  | 'not-a-backup'
  | 'corrupt'
  | 'incomplete'
  | 'checksum'
  | 'unknown-format'
  | 'newer-version'
  | 'invalid-version'

/** A backup file that must be refused. Nothing is ever written when this is
 * thrown: reading is a separate phase that never touches the database. */
export class BackupFormatError extends Error {
  readonly code: BackupErrorCode
  constructor(code: BackupErrorCode, message: string) {
    super(message)
    this.name = 'BackupFormatError'
    this.code = code
  }
}

/** A fully read, checksum-verified archive. Records are NOT yet validated
 * individually (that is `restorePlan`'s job): this only guarantees that the
 * container itself is whole and trustworthy. */
export interface ParsedBackup {
  manifest: BackupManifest
  /** Raw records per table, exactly as stored in `data/<table>.json`. */
  tables: Partial<Record<BackupTableName, unknown[]>>
  /** Verified media files, by archive path. Views on the archive buffer. */
  media: Map<string, Uint8Array>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Reads and verifies a backup archive without writing anything:
 * ZIP structure, size limits, manifest, schema version, per-file length and
 * CRC-32, and record counts. Throws `BackupFormatError` with a French message
 * for anything that is not a complete backup this version can read.
 */
export async function readBackup(
  file: Blob,
  options: RunOptions = {},
): Promise<ParsedBackup> {
  const { signal, onProgress } = options
  const yielder = createYielder(signal)

  if (file.size > MAX_BACKUP_FILE_BYTES) {
    throw new BackupFormatError(
      'too-large',
      'Ce fichier est trop volumineux pour être restauré sur cet appareil (limite : 1 Go).',
    )
  }
  if (file.size < 22) {
    throw new BackupFormatError(
      'not-a-backup',
      'Ce fichier n’est pas une sauvegarde de l’application (fichier vide ou trop court).',
    )
  }

  onProgress?.({ phase: 'Lecture du fichier', done: 0, total: 1 })
  let data: Uint8Array
  try {
    data = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new BackupFormatError(
      'too-large',
      'Impossible de lire ce fichier en mémoire (trop volumineux pour cet appareil, ou fichier inaccessible).',
    )
  }
  throwIfAborted(signal)

  // ZIP local-file / empty-archive signature.
  const isZip =
    data[0] === 0x50 && data[1] === 0x4b && (data[2] === 0x03 || data[2] === 0x05)
  if (!isZip) {
    throw new BackupFormatError(
      'not-a-backup',
      'Ce fichier n’est pas une sauvegarde de l’application (ce n’est pas une archive .zip).',
    )
  }

  const { unzipSync, strFromU8 } = await import('fflate')

  // Pass 1: list entries (central directory) and apply the size limits
  // before anything is inflated. A truncated archive fails right here.
  const names: string[] = []
  let totalDeclared = 0
  let guard: BackupFormatError | null = null
  try {
    unzipSync(data, {
      filter: (entry) => {
        names.push(entry.name)
        totalDeclared += entry.originalSize
        if (names.length > MAX_ENTRY_COUNT || entry.originalSize > MAX_ENTRY_BYTES) {
          guard = new BackupFormatError(
            'too-large',
            'Cette archive dépasse les limites acceptées (fichier interne trop gros ou trop nombreux).',
          )
        }
        return false
      },
    })
  } catch {
    throw new BackupFormatError(
      'corrupt',
      'Le fichier est corrompu ou incomplet (archive illisible, peut-être tronquée lors du transfert). Aucune donnée n’a été modifiée.',
    )
  }
  if (guard) throw guard
  if (totalDeclared > MAX_BACKUP_FILE_BYTES * 2) {
    throw new BackupFormatError(
      'too-large',
      'Cette archive dépasse les limites acceptées une fois décompressée.',
    )
  }
  if (!names.includes(MANIFEST_PATH)) {
    throw new BackupFormatError(
      'not-a-backup',
      'Ce fichier n’est pas une sauvegarde de l’application (manifest.json absent).',
    )
  }
  await yielder.force()

  // Pass 2: the small JSON files; pass 3: the media (stored, so cheap views).
  let jsonFiles: Record<string, Uint8Array>
  let mediaFiles: Record<string, Uint8Array>
  try {
    jsonFiles = unzipSync(data, {
      filter: (entry) =>
        entry.name === MANIFEST_PATH ||
        (entry.name.startsWith('data/') && entry.name.endsWith('.json')),
    })
    await yielder.force()
    mediaFiles = unzipSync(data, { filter: (entry) => entry.name.startsWith('media/') })
  } catch {
    throw new BackupFormatError(
      'corrupt',
      'Le fichier est corrompu (contenu illisible). Aucune donnée n’a été modifiée.',
    )
  }
  await yielder.force()

  const manifest = parseManifest(strFromU8(jsonFiles[MANIFEST_PATH]))

  // Integrity: every file the manifest lists must be present, whole, intact.
  const entries = Object.entries(manifest.files)
  let checked = 0
  for (const [path, expected] of entries) {
    const bytes = jsonFiles[path] ?? mediaFiles[path]
    if (!bytes) {
      throw new BackupFormatError(
        'incomplete',
        `La sauvegarde est incomplète : le fichier « ${path} » annoncé par le manifeste est absent. Aucune donnée n’a été modifiée.`,
      )
    }
    if (bytes.length !== expected.bytes || crc32(bytes) !== expected.crc32) {
      throw new BackupFormatError(
        'checksum',
        `La sauvegarde est altérée : le fichier « ${path} » ne correspond pas à son empreinte (longueur ou somme de contrôle). Aucune donnée n’a été modifiée.`,
      )
    }
    checked++
    onProgress?.({ phase: 'Vérification', done: checked, total: entries.length })
    await yielder.tick()
  }

  const tables: ParsedBackup['tables'] = {}
  for (const table of BACKUP_TABLES) {
    const declared = manifest.counts[table]
    if (declared === undefined) continue
    const bytes = jsonFiles[dataPath(table)]
    if (!bytes) {
      throw new BackupFormatError(
        'incomplete',
        `La sauvegarde est incomplète : les données « ${table} » sont absentes.`,
      )
    }
    let rows: unknown
    try {
      rows = JSON.parse(strFromU8(bytes))
    } catch {
      throw new BackupFormatError(
        'corrupt',
        `Le fichier de données « ${table} » est illisible (JSON invalide).`,
      )
    }
    if (!Array.isArray(rows) || rows.length !== declared) {
      throw new BackupFormatError(
        'incomplete',
        `Le nombre d’éléments de « ${table} » ne correspond pas au manifeste (${Array.isArray(rows) ? rows.length : 'format invalide'} au lieu de ${declared}).`,
      )
    }
    tables[table] = rows
    await yielder.tick()
  }

  const media = new Map<string, Uint8Array>(Object.entries(mediaFiles))
  return { manifest, tables, media }
}

function parseManifest(text: string): BackupManifest {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupFormatError('corrupt', 'Le manifeste de la sauvegarde est illisible.')
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
    throw new BackupFormatError(
      'unknown-format',
      'Ce fichier n’est pas une sauvegarde de CTR Hunting (format non reconnu).',
    )
  }
  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new BackupFormatError(
      'invalid-version',
      'La version de format de cette sauvegarde est invalide ou absente. Elle est refusée.',
    )
  }
  if (version > BACKUP_SCHEMA_VERSION) {
    throw new BackupFormatError(
      'newer-version',
      `Cette sauvegarde utilise le format version ${version}, plus récent que celui que cette version de l’application sait lire (version ${BACKUP_SCHEMA_VERSION}). Mettez l’application à jour avant de la restaurer. Aucune donnée n’a été modifiée.`,
    )
  }
  const counts = raw.counts
  const files = raw.files
  if (!isRecord(counts) || !isRecord(files)) {
    throw new BackupFormatError('corrupt', 'Le manifeste de la sauvegarde est incomplet.')
  }
  const cleanCounts: BackupManifest['counts'] = {}
  for (const table of BACKUP_TABLES) {
    const value = counts[table]
    if (value === undefined) continue
    if (!isNonNegativeInt(value)) {
      throw new BackupFormatError(
        'corrupt',
        `Le manifeste est invalide (compte de « ${table} »).`,
      )
    }
    cleanCounts[table] = value
  }
  const cleanFiles: Record<string, ManifestFileEntry> = {}
  for (const [path, entry] of Object.entries(files)) {
    if (
      !isRecord(entry) ||
      !isNonNegativeInt(entry.bytes) ||
      !isNonNegativeInt(entry.crc32) ||
      path.includes('..') ||
      path.startsWith('/')
    ) {
      throw new BackupFormatError(
        'corrupt',
        'Le manifeste est invalide (liste des fichiers).',
      )
    }
    cleanFiles[path] = { bytes: entry.bytes, crc32: entry.crc32 }
  }
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : ''
  return {
    format: BACKUP_FORMAT,
    schemaVersion: version,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : 'inconnue',
    databaseVersion: isNonNegativeInt(raw.databaseVersion) ? raw.databaseVersion : 0,
    createdAt,
    counts: cleanCounts,
    files: cleanFiles,
    limitations: Array.isArray(raw.limitations)
      ? raw.limitations.filter((line): line is string => typeof line === 'string')
      : [],
  }
}
