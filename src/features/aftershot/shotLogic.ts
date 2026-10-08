import type { Coordinate, Observation, ShotRecord, ShotSpecies, Waypoint } from '@/types'

export const SHOT_SPECIES_LABEL: Record<ShotSpecies, string> = {
  deer: 'Cerf',
  moose: 'Orignal',
}

/** Shown wherever the space is explained. The expert guide is not written: no
 * tracking advice, recovery delay or wound reading is given by the app. */
export const AFTERSHOT_DISCLAIMER =
  'Cet espace consigne ce que vous observez (tir, indices, directions) et vous aide à reprendre la recherche sur la carte. Il ne déduit ni la position de l’animal, ni la gravité d’une blessure, ni un délai d’attente : le guide expert (conseils de recherche) reste à compléter avec des sources vérifiables.'

export function shotEntries(observations: readonly Observation[]): Observation[] {
  return observations
    .filter((o) => o.shot !== undefined)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export type TimelineKind = 'shot' | 'clue'

export interface TimelineItem {
  id: string
  kind: TimelineKind
  atMs: number
  label: string
  coordinate: Coordinate
  /** `manual`: placed by hand, not read from the GPS. */
  origin: 'gps' | 'manual' | undefined
}

/** The shot, then the clues of its linked search, oldest first. Only what was
 * recorded is listed. */
export function buildTimeline(
  entry: Observation,
  clues: readonly Waypoint[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      id: entry.id,
      kind: 'shot',
      atMs: new Date(entry.timestamp).getTime(),
      label: 'Tir',
      coordinate: entry.coordinate,
      origin: entry.positionOrigin,
    },
    ...clues.map((clue): TimelineItem => ({
      id: clue.id,
      kind: 'clue',
      atMs: new Date(clue.createdAt).getTime(),
      label: clue.name,
      coordinate: clue.coordinate,
      origin: clue.origin,
    })),
  ]
  return items.sort((a, b) => a.atMs - b.atMs)
}

/** Display-only markers for the mini map (never saved as waypoints). */
export function shotMarkers(entry: Observation): Waypoint[] {
  const shot = entry.shot
  if (!shot) return []
  const base = { createdAt: entry.timestamp, updatedAt: entry.timestamp }
  const markers: Waypoint[] = [
    {
      id: `${entry.id}:shot`,
      name: 'Lieu du tir',
      coordinate: entry.coordinate,
      category: 'kill_site',
      color: '#f59e0b',
      ...base,
    },
  ]
  if (shot.lastConfirmedPosition) {
    markers.push({
      id: `${entry.id}:last`,
      name: 'Dernière position confirmée',
      coordinate: shot.lastConfirmedPosition,
      category: 'game_sign',
      color: '#22c55e',
      ...base,
    })
  }
  if (shot.estimatedAnimalPosition) {
    markers.push({
      id: `${entry.id}:estimate`,
      name: 'Estimation manuelle',
      coordinate: shot.estimatedAnimalPosition,
      category: 'custom',
      color: '#a855f7',
      ...base,
    })
  }
  return markers
}

export interface ShotDraft {
  species: ShotSpecies
  shotAtMs: number | null
  position: Coordinate | null
  positionOrigin: 'gps' | 'manual'
  reaction: string
  fleeDirection: string
  estimated: Coordinate | null
  lastConfirmed: Coordinate | null
  notes: string
  searchSessionId?: string
}

export type ShotBuild =
  | {
      ok: true
      coordinate: Coordinate
      timestamp: string
      notes: string
      shot: ShotRecord
    }
  | { ok: false; message: string }

/** Turns the form into a journal entry; refuses to invent what is missing. */
export function buildShotEntry(draft: ShotDraft): ShotBuild {
  if (!draft.position) {
    return {
      ok: false,
      message:
        'Position du tir absente : choisissez votre position GPS ou le centre de la carte.',
    }
  }
  if (draft.shotAtMs === null) return { ok: false, message: 'Date ou heure invalide.' }
  const shot: ShotRecord = { species: draft.species }
  const reaction = draft.reaction.trim()
  if (reaction) shot.reaction = reaction
  if (draft.fleeDirection !== '') {
    const degrees = Number(draft.fleeDirection)
    if (Number.isFinite(degrees))
      shot.fleeDirectionDegrees = ((degrees % 360) + 360) % 360
  }
  if (draft.estimated) shot.estimatedAnimalPosition = draft.estimated
  if (draft.lastConfirmed) shot.lastConfirmedPosition = draft.lastConfirmed
  if (draft.searchSessionId) shot.searchSessionId = draft.searchSessionId
  return {
    ok: true,
    coordinate: draft.position,
    timestamp: new Date(draft.shotAtMs).toISOString(),
    notes: draft.notes.trim(),
    shot,
  }
}
