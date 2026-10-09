import { formatAge, gpsAgeMs } from '@/features/gps/gpsFreshness'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { resolveMarkerPosition } from '@/features/blood/markerPosition'
import type { Coordinate, DeerEntry, DeerEntryKind } from '@/types'

/** What the « + Repère » panel can create. */
export type AddPointType = 'normal' | 'blood' | 'deer' | 'moose' | 'camera'

export const ADD_POINT_TYPES: readonly {
  id: AddPointType
  label: string
  hint: string
}[] = [
  { id: 'normal', label: 'Repère normal', hint: 'Nom, icône, couleur, photo, notes' },
  { id: 'blood', label: 'Sang / indice', hint: 'Goutte rouge, rattaché à une recherche' },
  { id: 'deer', label: 'Observation cerf', hint: 'Journal DeerTracker' },
  { id: 'moose', label: 'Observation orignal', hint: 'Journal d’observations' },
  { id: 'camera', label: 'Caméra sang', hint: 'Aide visuelle expérimentale' },
]

export type PositionMode = 'gps' | 'map'

/** Kinds offered for an animal observation (the user's own words, no
 * identification). */
export const ANIMAL_KINDS: readonly { id: DeerEntryKind; label: string }[] = [
  { id: 'sighting', label: 'Animal observé' },
  { id: 'track', label: 'Piste / empreinte' },
  { id: 'scrape', label: 'Grattage' },
  { id: 'rub', label: 'Frottis' },
  { id: 'other_sign', label: 'Autre indice' },
]

export interface GpsView {
  /** A fix recent enough to be « my position ». */
  usable: boolean
  coordinate: Coordinate | null
  /** « ±8 m · il y a 3 s », or why there is no position. Never invented. */
  line: string
  lowAccuracy: boolean
  old: boolean
}

/** What the panel says about the phone's position. */
export function describeGps(reading: GeolocationReading, nowMs: number): GpsView {
  const position = resolveMarkerPosition(reading, nowMs)
  if (position.kind === 'unavailable' || reading.status !== 'available') {
    const reason =
      reading.status === 'unavailable'
        ? reading.reason
        : position.kind === 'unavailable' && position.reason === 'stale'
          ? 'dernière position trop ancienne'
          : 'aucune position'
    return {
      usable: false,
      coordinate: null,
      line: `Position GPS indisponible : ${reason}`,
      lowAccuracy: false,
      old: false,
    }
  }
  const accuracy = position.coordinate.accuracyMeters
  const accuracyText =
    accuracy === undefined ? 'précision inconnue' : `±${Math.round(accuracy)} m`
  const age = formatAge(gpsAgeMs(nowMs, reading.value.timestampMs))
  return {
    usable: true,
    coordinate: position.coordinate,
    line: `${accuracyText} · ${age}${position.lowAccuracy ? ' · précision faible' : ''}${position.freshness === 'old' ? ' · position un peu ancienne' : ''}`,
    lowAccuracy: position.lowAccuracy,
    old: position.freshness === 'old',
  }
}

export interface AnimalDraft {
  kind: DeerEntryKind
  count: string
  notes: string
}

export const EMPTY_ANIMAL_DRAFT: AnimalDraft = { kind: 'sighting', count: '', notes: '' }

function parseCount(value: string): number | undefined {
  const n = Number.parseInt(value, 10)
  return Number.isInteger(n) && n > 0 && n <= 99 ? n : undefined
}

/** Journal fields for an observation made from « + Repère ». A deer entry
 * lands in DeerTracker; a moose entry is an ordinary journal entry marked
 * `species: 'moose'` so it never feeds the deer statistics. Only what the user
 * typed is recorded. */
export function buildAnimalObservation(
  species: 'deer' | 'moose',
  draft: AnimalDraft,
): { notes: string; deer?: DeerEntry; species?: 'moose' } {
  const count = parseCount(draft.count)
  const note = draft.notes.trim()
  if (species === 'deer') {
    const deer: DeerEntry = { kind: draft.kind }
    if (count !== undefined) deer.count = count
    return { notes: note, deer }
  }
  const label = ANIMAL_KINDS.find((k) => k.id === draft.kind)?.label ?? 'Observation'
  const head = `Orignal — ${label}${count !== undefined ? ` × ${count}` : ''}`
  return { notes: note ? `${head}. ${note}` : head, species: 'moose' }
}
