import {
  HISTORY_RADIUS_METERS,
  SIGN_CATEGORIES,
  historyAnalyzer,
} from '@/utils/analyzers'
import { haversineMeters } from '@/utils/geo'
import type { Waypoint } from '@/types'
import type { CompareRecords, NearbyRecord, ObservationsValue } from './types'

/** Même rayon que l'analyseur d'observations (famille Observations). */
export const NEARBY_RADIUS_METERS = HISTORY_RADIUS_METERS

export const ANIMALS_UNAVAILABLE_REASON =
  'Non disponible : l’application n’a aucune donnée structurée « animal observé » (une entrée de journal est du texte libre, dont rien n’est déduit).'

function journalLabel(notes: string, timestamp: string): string {
  const text = notes.trim().replace(/\s+/g, ' ')
  const date = new Date(timestamp)
  const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-CA')
  const title = text
    ? text.length > 40
      ? `${text.slice(0, 40)}…`
      : text
    : 'Entrée sans titre'
  return when ? `${title} (${when})` : title
}

/**
 * Enregistrements personnels autour d'un point de repère, avec des comptes
 * SÉPARÉS : visites (traces GPS), signes de gibier (points de repère),
 * entrées de journal — et « animaux observés » explicitement indisponible.
 * Le point comparé lui-même n'est jamais compté comme son propre signe. Les
 * enregistrements sont lus tous territoires confondus (un signe proche reste
 * pertinent quel que soit son dossier).
 */
export function summarizeObservations(
  waypoint: Waypoint,
  records: CompareRecords,
  radiusMeters: number = NEARBY_RADIUS_METERS,
): ObservationsValue {
  const others = records.waypoints.filter((w) => w.id !== waypoint.id)
  const distanceTo = (c: { lat: number; lng: number }) =>
    haversineMeters(waypoint.coordinate, c)

  const signs = others
    .filter(
      (w) => SIGN_CATEGORIES.has(w.category) && distanceTo(w.coordinate) <= radiusMeters,
    )
    .map<NearbyRecord>((w) => ({
      id: w.id,
      kind: 'waypoint',
      label: w.name,
      distanceMeters: distanceTo(w.coordinate),
      category: w.category,
    }))
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))

  const journal = records.observations
    .filter(
      (o) => o.waypointId === waypoint.id || distanceTo(o.coordinate) <= radiusMeters,
    )
    .map<NearbyRecord>((o) => ({
      id: o.id,
      kind: 'journal',
      label: journalLabel(o.notes, o.timestamp),
      distanceMeters: distanceTo(o.coordinate),
    }))
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))

  const trackIds = records.tracks
    .filter((t) => t.points.some((p) => distanceTo(p) <= radiusMeters))
    .map((t) => t.id)

  // Le MÊME moteur que la carte de potentiel : famille Observations.
  const analyzer = historyAnalyzer(waypoint.coordinate, others, records.tracks, {
    radiusMeters,
    observations: records.observations.filter(
      (o) => o.waypointId === waypoint.id || distanceTo(o.coordinate) <= radiusMeters,
    ),
    dataTime: records.readAt ?? undefined,
  })

  return {
    radiusMeters,
    visits: { count: trackIds.length, trackIds },
    gameSigns: { count: signs.length, items: signs },
    journalEntries: { count: journal.length, items: journal },
    animalsObserved: { status: 'unavailable', reason: ANIMALS_UNAVAILABLE_REASON },
    analyzer,
  }
}
