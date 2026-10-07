import { CATEGORY_LABEL } from '@/features/waypoints/categories'
import { filterItems } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { totalDistanceMeters } from '@/utils/geo'
import type { Observation, Territory, Track, Waypoint } from '@/types'
import { cleanText, noteExcerpt, quoteData, formatDay, LABEL_MAX } from './text'
import type { EntityRef } from './types'

/** Les enregistrements personnels lus sur l'appareil (jamais modifiés ici). */
export interface AssistantRecords {
  waypoints: readonly Waypoint[]
  tracks: readonly Track[]
  observations: readonly Observation[]
  territories: readonly Territory[]
}

export const EMPTY_RECORDS: AssistantRecords = {
  waypoints: [],
  tracks: [],
  observations: [],
  territories: [],
}

// ----------------------------------------------------------------- références

export function waypointRef(w: Waypoint): EntityRef {
  return {
    kind: 'waypoint',
    id: w.id,
    label: cleanText(w.name, LABEL_MAX) || 'Point sans nom',
    coordinate: { lat: w.coordinate.lat, lng: w.coordinate.lng },
    excerpt: noteExcerpt(w.notes),
    photoIds: w.photoIds && w.photoIds.length > 0 ? [...w.photoIds] : undefined,
  }
}

export function trackRef(t: Track): EntityRef {
  const first = t.points[0]
  return {
    kind: 'track',
    id: t.id,
    label: cleanText(t.name, LABEL_MAX) || 'Trace sans nom',
    coordinate: first ? { lat: first.lat, lng: first.lng } : undefined,
    excerpt: noteExcerpt(t.notes),
  }
}

export function journalRef(o: Observation): EntityRef {
  const excerpt = noteExcerpt(o.notes)
  return {
    kind: 'journal',
    id: o.id,
    label: `${cleanText(o.notes, 40) || 'Entrée sans texte'} (${formatDay(o.timestamp)})`,
    coordinate: { lat: o.coordinate.lat, lng: o.coordinate.lng },
    excerpt,
    photoIds: o.photoIds && o.photoIds.length > 0 ? [...o.photoIds] : undefined,
  }
}

export function categoryLabel(category: Waypoint['category']): string {
  return CATEGORY_LABEL[category] ?? category
}

/** Nom d'un point entre guillemets, nettoyé (donnée, jamais interprétée). */
export function waypointTitle(w: Waypoint): string {
  return quoteData(w.name)
}

// ------------------------------------------------------------------ portée

export interface ScopedRecords {
  waypoints: Waypoint[]
  tracks: Track[]
  observations: Observation[]
}

/** Éléments visibles avec un filtre de territoire (même règle que les
 * listes : un élément d'un territoire disparu est « Non classé »). */
export function scopeRecords(
  records: AssistantRecords,
  filter: TerritoryFilter,
): ScopedRecords {
  return {
    waypoints: filterItems(records.waypoints, filter, records.territories),
    tracks: filterItems(records.tracks, filter, records.territories),
    observations: filterItems(records.observations, filter, records.territories),
  }
}

// -------------------------------------------------------------------- dates

/** Millisecondes d'une date ISO, `null` si elle est absente ou invalide. */
export function timeOf(iso: string | undefined | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/** Début et fin (inclus) d'un jour local `YYYY-MM-DD`, ou `null` si invalide. */
export function dayBounds(day: string): { start: number; end: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const start = new Date(y, m - 1, d, 0, 0, 0, 0)
  // Rejette 2026-02-31 (le constructeur « déborde » au mois suivant).
  if (start.getFullYear() !== y || start.getMonth() !== m - 1 || start.getDate() !== d) {
    return null
  }
  const end = new Date(y, m - 1, d, 23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

// ------------------------------------------------------------------- traces

export interface TrackMetrics {
  /** `null` : ni distance enregistrée ni points pour la calculer. */
  distanceMeters: number | null
  /** `null` : trace sans fin (en cours ou interrompue) ou dates invalides. */
  durationMs: number | null
}

/** Distance enregistrée de la trace, sinon recalculée depuis ses points. */
export function trackMetrics(track: Track): TrackMetrics {
  let distanceMeters: number | null = null
  if (typeof track.distanceMeters === 'number' && Number.isFinite(track.distanceMeters)) {
    distanceMeters = track.distanceMeters
  } else if (track.points.length >= 2) {
    distanceMeters = totalDistanceMeters(track.points)
  }
  const start = timeOf(track.startedAt)
  const end = timeOf(track.endedAt)
  const durationMs = start !== null && end !== null && end >= start ? end - start : null
  return { distanceMeters, durationMs }
}

export type TrackMetricsLookup = (track: Track) => TrackMetrics

/** Date représentative de chaque type d'élément (pour tri et périodes). */
export const waypointTime = (w: Waypoint) => timeOf(w.createdAt)
export const trackTime = (t: Track) => timeOf(t.startedAt)
export const journalTime = (o: Observation) => timeOf(o.timestamp)

// -------------------------------------------------------------- statistiques

/** Moyenne simple, `null` pour une liste vide. */
export function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Direction moyenne CIRCULAIRE (le vent « de 350° » et « de 10° » donne
 * 0°, pas 180°). `concentration` (0 à 1) dit si les directions vont dans le
 * même sens : proche de 0, la « moyenne » ne signifie rien.
 */
export function circularMeanDegrees(
  degrees: readonly number[],
): { mean: number; concentration: number } | null {
  if (degrees.length === 0) return null
  let sin = 0
  let cos = 0
  for (const d of degrees) {
    const rad = (d * Math.PI) / 180
    sin += Math.sin(rad)
    cos += Math.cos(rad)
  }
  const n = degrees.length
  const concentration = Math.hypot(sin / n, cos / n)
  const meanDeg = ((Math.atan2(sin / n, cos / n) * 180) / Math.PI + 360) % 360
  return { mean: meanDeg, concentration }
}
