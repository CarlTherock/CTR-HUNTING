import type { Observation, Track } from '@/types'
import { zonedDateKey } from '@/features/hunting-hours/zonedTime'

export type SourceGroup = 'direct' | 'ground_sign' | 'camera'

export const GROUP_LABEL: Record<SourceGroup, string> = {
  direct: 'Observations directes',
  ground_sign: 'Indices au sol',
  camera: 'Caméras',
}

/** Design parameters (not biological values): entries of the same group close
 * in time and space are one sequence, not independent events. */
export const SEQUENCE_GAP_MINUTES = 30
export const SEQUENCE_RADIUS_METERS = 100

export interface ObservationsSummary {
  /** Deer entries considered (all, from the first one). */
  entries: number
  /** Independent events after grouping sequences. */
  events: number
  byGroup: Record<SourceGroup, { entries: number; events: number }>
  firstDay?: string
  lastDay?: string
  /** Distinct calendar days with at least one entry. */
  daysWithEntries: number
  /** Calendar days from first to last entry, inclusive. */
  daysSpan: number
  /** Distinct days with a recorded GPS track inside the span. */
  effortDays: number
  hasEffort: boolean
  /** Always descriptive: what can and cannot be concluded. */
  statement: string
}

function groupOf(
  o: Observation,
  cameraWaypointIds: ReadonlySet<string>,
): SourceGroup | null {
  if (!o.deer) return null
  if (o.waypointId && cameraWaypointIds.has(o.waypointId)) return 'camera'
  return o.deer.kind === 'sighting' ? 'direct' : 'ground_sign'
}

function meters(a: Observation['coordinate'], b: Observation['coordinate']): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function countEvents(items: readonly Observation[]): number {
  const sorted = [...items].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const heads: Observation[] = []
  for (const o of sorted) {
    const t = Date.parse(o.timestamp)
    const joined = heads.some(
      (h) =>
        t - Date.parse(h.timestamp) <= SEQUENCE_GAP_MINUTES * 60_000 &&
        meters(h.coordinate, o.coordinate) <= SEQUENCE_RADIUS_METERS,
    )
    // A photo-heavy sequence is one entry or several close ones: either way one event.
    if (!joined) heads.push(o)
  }
  return heads.length
}

export function summarizeObservations(
  observations: readonly Observation[],
  tracks: readonly Track[],
  options: { timeZone: string; cameraWaypointIds?: ReadonlySet<string> },
): ObservationsSummary {
  const cams = options.cameraWaypointIds ?? new Set<string>()
  const buckets: Record<SourceGroup, Observation[]> = {
    direct: [],
    ground_sign: [],
    camera: [],
  }
  for (const o of observations) {
    const g = groupOf(o, cams)
    if (g) buckets[g].push(o)
  }
  const all = [...buckets.direct, ...buckets.ground_sign, ...buckets.camera]
  const byGroup = {
    direct: { entries: buckets.direct.length, events: countEvents(buckets.direct) },
    ground_sign: {
      entries: buckets.ground_sign.length,
      events: countEvents(buckets.ground_sign),
    },
    camera: { entries: buckets.camera.length, events: countEvents(buckets.camera) },
  }
  const days = [
    ...new Set(all.map((o) => zonedDateKey(new Date(o.timestamp), options.timeZone))),
  ].sort()
  const firstDay = days[0]
  const lastDay = days[days.length - 1]
  const daysSpan =
    firstDay && lastDay
      ? Math.round((Date.parse(lastDay) - Date.parse(firstDay)) / 86_400_000) + 1
      : 0
  const effortSet = new Set<string>()
  if (firstDay && lastDay) {
    for (const t of tracks) {
      const d = zonedDateKey(new Date(t.startedAt), options.timeZone)
      if (d >= firstDay && d <= lastDay) effortSet.add(d)
    }
  }
  const hasEffort = effortSet.size > 0
  const statement =
    all.length === 0
      ? 'Aucune observation de cerf enregistrée pour l’instant.'
      : hasEffort
        ? 'Ces chiffres décrivent ce que vous avez saisi. Les sorties enregistrées donnent une idée de votre effort, mais pas assez pour conclure à une hausse ou une baisse de l’activité des cerfs.'
        : 'Aucune sortie enregistrée sur cette période : l’effort d’observation est inconnu. Ces chiffres ne permettent pas de conclure à une hausse ou une baisse de l’activité des cerfs.'
  return {
    entries: all.length,
    events: byGroup.direct.events + byGroup.ground_sign.events + byGroup.camera.events,
    byGroup,
    firstDay,
    lastDay,
    daysWithEntries: days.length,
    daysSpan,
    effortDays: effortSet.size,
    hasEffort,
    statement,
  }
}
