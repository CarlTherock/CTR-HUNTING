import type {
  BloodMarkerKind,
  BloodSession,
  BloodSessionStatus,
  Coordinate,
  Track,
  Waypoint,
} from '@/types'

export const BLOOD_MARKER_LABEL: Record<BloodMarkerKind, string> = {
  blood: 'Sang',
  shot_site: 'Lieu du tir',
  last_seen: 'Dernière position observée',
  blood_confirmed: 'Sang confirmé',
  other_clue: 'Autre indice',
  animal_found: 'Animal retrouvé',
  vehicle: 'Véhicule',
}

/** Quick markers offered besides the main « + Sang » button, in display order. */
export const QUICK_MARKER_KINDS: readonly BloodMarkerKind[] = [
  'shot_site',
  'last_seen',
  'blood_confirmed',
  'other_clue',
  'animal_found',
  'vehicle',
]

export const SESSION_STATUS_LABEL: Record<BloodSessionStatus, string> = {
  waiting_gps: 'En attente du GPS',
  active: 'En cours',
  paused: 'En pause',
  finished: 'Terminée',
}

/** Kinds whose name always carries a number (they are naturally repeated). */
const ALWAYS_NUMBERED: ReadonlySet<BloodMarkerKind> = new Set([
  'blood',
  'blood_confirmed',
  'other_clue',
])

/** « Sang 01 », « Sang 02 »… Unique markers (shot site, vehicle…) are only
 * numbered from their second occurrence. */
export function markerName(kind: BloodMarkerKind, n: number): string {
  const label = BLOOD_MARKER_LABEL[kind]
  if (!ALWAYS_NUMBERED.has(kind) && n <= 1) return label
  return `${label} ${String(n).padStart(2, '0')}`
}

export function isOpenSession(session: Pick<BloodSession, 'status'>): boolean {
  return session.status !== 'finished'
}

/** Clues of a session in the order they were made (by creation time). */
export function sessionClues(waypoints: readonly Waypoint[], sessionId: string) {
  return waypoints
    .filter((w) => w.sessionId === sessionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/** The most recent « Sang » clue — computed from the waypoints, never stored
 * twice, so it can never disagree with them. */
export function lastBloodClue(clues: readonly Waypoint[]): Waypoint | null {
  return clues.filter((c) => c.bloodKind === 'blood').at(-1) ?? null
}

/** The most recent clue of any kind. */
export function lastClue(clues: readonly Waypoint[]): Waypoint | null {
  return clues.at(-1) ?? null
}

/** Pairs of consecutive clues, for the optional dashed link. A visual aid
 * between observed points: it says nothing about the animal's path. */
export function clueLinkPaths(clues: readonly Waypoint[]): Coordinate[][] {
  const links: Coordinate[][] = []
  for (let i = 1; i < clues.length; i++) {
    links.push([clues[i - 1].coordinate, clues[i].coordinate])
  }
  return links
}

/** Recorded movement time of a track from its timestamps; `null` when it
 * cannot be known. Pauses, interruptions and waiting are not counted. */
export function trackActiveMs(track: Pick<Track, 'points' | 'breaks'>): number | null {
  const { points } = track
  if (points.length < 2) return null
  const cuts = new Set(track.breaks ?? [])
  let total = 0
  for (let i = 1; i < points.length; i++) {
    if (cuts.has(i)) continue
    total += Math.max(
      0,
      Date.parse(points[i].timestamp) - Date.parse(points[i - 1].timestamp),
    )
  }
  return Number.isFinite(total) ? total : null
}

/** Center and zoom that fit all given positions on screen (bird's-eye view of
 * a session). A single position keeps a close field zoom. The zoom is an
 * estimate from the largest span: it only frames the map, no measurement. */
export function overviewView(coordinates: readonly Coordinate[]): {
  center: Coordinate
  zoom: number
} | null {
  if (coordinates.length === 0) return null
  const lats = coordinates.map((c) => c.lat)
  const lngs = coordinates.map((c) => c.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
  const span = Math.max(maxLat - minLat, maxLng - minLng)
  if (span < 1e-5) return { center, zoom: 17 }
  const zoom = Math.floor(Math.log2(360 / (span * 1.6)))
  return { center, zoom: Math.min(18, Math.max(2, zoom)) }
}
