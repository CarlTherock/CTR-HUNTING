import type { BackupTableName, PhotoArchiveEntry } from './format'
import { isBackupSettingKey } from './format'

/**
 * Per-record validation for restore. A record that fails is reported as
 * « invalide » and never written. Validation is deliberately about SHAPE and
 * RANGES (ids, finite coordinates, required strings); unknown extra fields
 * are kept as-is so that data written by a newer app version (or by another
 * slice of this one) survives a round trip.
 *
 * Backward compatibility (documented in docs/BACKUP_FORMAT.md): optional
 * fields may be missing; a waypoint without `updatedAt` gets `createdAt`; an
 * observation without `notes` gets an empty string.
 */
export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

function validCoordinate(value: unknown): boolean {
  if (!isRecord(value) || !isValidLatLng(value.lat, value.lng)) return false
  if (value.altitude !== undefined && !isFiniteNumber(value.altitude)) return false
  if (
    value.accuracyMeters !== undefined &&
    (!isFiniteNumber(value.accuracyMeters) || value.accuracyMeters < 0)
  ) {
    return false
  }
  return true
}

function validIsoLike(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return value === undefined || typeof value === 'string' ? null : `« ${key} » invalide`
}

type Rec = Record<string, unknown>

function validateWaypoint(raw: Rec): Validation<Rec> {
  if (typeof raw.name !== 'string') return fail('nom manquant')
  if (!validCoordinate(raw.coordinate)) return fail('coordonnées invalides')
  if (typeof raw.category !== 'string') return fail('catégorie manquante')
  if (!validIsoLike(raw.createdAt)) return fail('date de création invalide')
  for (const key of ['notes', 'territoryId', 'color']) {
    const problem = optionalString(raw, key)
    if (problem) return fail(problem)
  }
  if (raw.photoIds !== undefined && !isStringArray(raw.photoIds)) {
    return fail('liste de photos invalide')
  }
  return {
    ok: true,
    value: {
      ...raw,
      updatedAt: validIsoLike(raw.updatedAt) ? raw.updatedAt : raw.createdAt,
    },
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validateTrack(raw: Rec): Validation<Rec> {
  if (typeof raw.name !== 'string') return fail('nom manquant')
  if (!validIsoLike(raw.startedAt)) return fail('date de début invalide')
  if (!Array.isArray(raw.points)) return fail('points manquants')
  for (let i = 0; i < raw.points.length; i++) {
    const point: unknown = raw.points[i]
    if (!validCoordinate(point)) return fail(`point ${i + 1} : coordonnées invalides`)
    if (typeof (point as Rec).timestamp !== 'string') {
      return fail(`point ${i + 1} : horodatage manquant`)
    }
  }
  if (raw.endedAt !== undefined && !validIsoLike(raw.endedAt)) {
    return fail('date de fin invalide')
  }
  if (raw.distanceMeters !== undefined && !isFiniteNumber(raw.distanceMeters)) {
    return fail('distance invalide')
  }
  for (const key of ['notes', 'territoryId']) {
    const problem = optionalString(raw, key)
    if (problem) return fail(problem)
  }
  return { ok: true, value: { ...raw } }
}

function validateObservation(raw: Rec): Validation<Rec> {
  if (!validCoordinate(raw.coordinate)) return fail('coordonnées invalides')
  if (!validIsoLike(raw.timestamp)) return fail('horodatage invalide')
  if (raw.notes !== undefined && typeof raw.notes !== 'string')
    return fail('notes invalides')
  for (const key of ['waypointId', 'territoryId']) {
    const problem = optionalString(raw, key)
    if (problem) return fail(problem)
  }
  if (raw.photoIds !== undefined && !isStringArray(raw.photoIds)) {
    return fail('liste de photos invalide')
  }
  return {
    ok: true,
    value: { ...raw, notes: typeof raw.notes === 'string' ? raw.notes : '' },
  }
}

function validateTerritory(raw: Rec): Validation<Rec> {
  if (typeof raw.name !== 'string') return fail('nom manquant')
  if (!validIsoLike(raw.createdAt)) return fail('date de création invalide')
  return {
    ok: true,
    value: {
      ...raw,
      updatedAt: validIsoLike(raw.updatedAt) ? raw.updatedAt : raw.createdAt,
    },
  }
}

function validateOfflineArea(raw: Rec): Validation<Rec> {
  if (typeof raw.name !== 'string') return fail('nom manquant')
  const bounds = raw.bounds
  if (
    !isRecord(bounds) ||
    !isValidLatLng(bounds.south, bounds.west) ||
    !isValidLatLng(bounds.north, bounds.east)
  ) {
    return fail('étendue invalide')
  }
  if (!isFiniteNumber(raw.minZoom) || !isFiniteNumber(raw.maxZoom))
    return fail('zooms invalides')
  if (typeof raw.baseLayer !== 'string') return fail('fond de carte manquant')
  if (!validIsoLike(raw.createdAt)) return fail('date de création invalide')
  return { ok: true, value: { ...raw } }
}

export interface ValidatedRecord {
  id: string
  label: string
  record: Rec
}

/** Validates the record of every table except photos and settings (see below). */
export function validateRecord(
  table: Exclude<BackupTableName, 'photos' | 'settings'>,
  raw: unknown,
): Validation<ValidatedRecord> {
  if (!isRecord(raw)) return fail('enregistrement illisible')
  if (!nonEmptyString(raw.id)) return fail('identifiant manquant')
  const validators: Record<typeof table, (r: Rec) => Validation<Rec>> = {
    territories: validateTerritory,
    waypoints: validateWaypoint,
    tracks: validateTrack,
    observations: validateObservation,
    offlineAreas: validateOfflineArea,
  }
  const result = validators[table](raw)
  if (!result.ok) return result
  return {
    ok: true,
    value: { id: raw.id, label: labelOf(table, result.value), record: result.value },
  }
}

function labelOf(table: BackupTableName, record: Rec): string {
  const name = typeof record.name === 'string' && record.name ? record.name : null
  if (name) return name
  if (table === 'observations') {
    const notes = typeof record.notes === 'string' ? record.notes.trim() : ''
    return notes ? notes.slice(0, 40) : 'Entrée de journal'
  }
  return String(record.id)
}

export function validateSetting(
  raw: unknown,
): Validation<{ key: string; value: unknown }> {
  if (!isRecord(raw) || !nonEmptyString(raw.key)) return fail('clé manquante')
  if (!isBackupSettingKey(raw.key)) return fail('réglage non pris en charge (ignoré)')
  if (!('value' in raw)) return fail('valeur manquante')
  return { ok: true, value: { key: raw.key, value: raw.value } }
}

export interface ValidatedPhoto {
  id: string
  record: Rec
  blobBytes: Uint8Array
  blobType: string
  /** `null` when originalBlob has the same bytes as blob. */
  originalBytes: Uint8Array | null
  originalType: string
}

export function validatePhotoEntry(
  raw: unknown,
  media: ReadonlyMap<string, Uint8Array>,
): Validation<ValidatedPhoto> {
  if (!isRecord(raw)) return fail('enregistrement illisible')
  const entry = raw as Partial<PhotoArchiveEntry> & Rec
  const record = entry.record
  if (!isRecord(record) || !nonEmptyString(record.id)) return fail('identifiant manquant')
  if (!validIsoLike(record.createdAt)) return fail('date de création invalide')
  const hasWaypoint = record.waypointId !== undefined
  const hasObservation = record.observationId !== undefined
  if (hasWaypoint === hasObservation) {
    return fail(
      'une photo doit appartenir à exactement un point de repère ou une entrée de journal',
    )
  }
  const ownerKey = hasWaypoint ? 'waypointId' : 'observationId'
  if (!nonEmptyString(record[ownerKey])) return fail('parent invalide')
  if (record.coordinate !== undefined && !validCoordinate(record.coordinate)) {
    return fail('coordonnées invalides')
  }
  const blobRef = entry.blob
  if (!isRecord(blobRef) || typeof blobRef.path !== 'string')
    return fail('fichier image manquant')
  const blobBytes = media.get(blobRef.path)
  if (!blobBytes || blobBytes.length === 0) return fail('fichier image absent ou vide')
  let originalBytes: Uint8Array | null = null
  let originalType = typeof blobRef.type === 'string' ? blobRef.type : ''
  if (entry.original != null) {
    const originalRef = entry.original
    if (!isRecord(originalRef) || typeof originalRef.path !== 'string') {
      return fail('original manquant')
    }
    originalBytes = media.get(originalRef.path) ?? null
    if (!originalBytes || originalBytes.length === 0)
      return fail('original absent ou vide')
    originalType = typeof originalRef.type === 'string' ? originalRef.type : ''
  }
  return {
    ok: true,
    value: {
      id: record.id,
      record: { ...record },
      blobBytes,
      blobType: typeof blobRef.type === 'string' ? blobRef.type : '',
      originalBytes,
      originalType,
    },
  }
}
