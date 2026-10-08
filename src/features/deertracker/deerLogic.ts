import { UNCLASSIFIED_LABEL, matchesTerritoryFilter } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import type {
  DeerAgeClass,
  DeerEntryKind,
  DeerSex,
  Observation,
  Territory,
} from '@/types'

/** Entry kinds in display order. */
export const DEER_KINDS: readonly DeerEntryKind[] = [
  'sighting',
  'track',
  'scrape',
  'rub',
  'other_sign',
]

export const DEER_KIND_LABEL: Record<DeerEntryKind, string> = {
  sighting: 'Cerf observé',
  track: 'Piste / empreinte',
  scrape: 'Grattage',
  rub: 'Frottis',
  other_sign: 'Autre indice',
}

export const DEER_SEX_LABEL: Record<DeerSex, string> = {
  male: 'Mâle',
  female: 'Femelle',
}

export const DEER_AGE_LABEL: Record<DeerAgeClass, string> = {
  fawn: 'Faon',
  young: 'Jeune',
  adult: 'Adulte',
}

export const DEER_DISCLAIMER =
  'DeerTracker garde MES observations et indices de cerfs. Ce n’est ni la localisation en direct d’un animal sauvage, ni une prévision de sa présence : les statistiques reflètent ce que j’ai saisi et là où j’ai observé, pas la population réelle.'

/** An entry classified in DeerTracker. Entries without `deer` stay ordinary
 * journal entries and are never reclassified automatically. */
export function isDeerEntry(observation: Observation): boolean {
  return observation.deer !== undefined
}

export function deerEntries(observations: readonly Observation[]): Observation[] {
  return observations.filter(isDeerEntry)
}

export interface DeerFilters {
  territory: TerritoryFilter
  /** Kinds kept; empty = all kinds. */
  kinds: readonly DeerEntryKind[]
  /** Inclusive bounds on the OBSERVATION time (epoch ms). */
  fromMs?: number
  toMs?: number
}

export function filterDeerEntries(
  observations: readonly Observation[],
  filters: DeerFilters,
  territories: readonly Territory[],
): Observation[] {
  return observations.filter((o) => {
    if (!o.deer) return false
    if (!matchesTerritoryFilter(o.territoryId, filters.territory, territories))
      return false
    if (filters.kinds.length > 0 && !filters.kinds.includes(o.deer.kind)) return false
    const at = new Date(o.timestamp).getTime()
    if (filters.fromMs !== undefined && at < filters.fromMs) return false
    if (filters.toMs !== undefined && at > filters.toMs) return false
    return true
  })
}

export interface DeerSummary {
  entries: number
  /** Sum of the counts the user typed. */
  animalsCounted: number
  /** Entries where no count was typed (not counted as zero). */
  withoutCount: number
  kinds: { kind: DeerEntryKind; count: number }[]
  /** Observations per hour of the day, local time, index 0..23. */
  perHour: number[]
  territories: { label: string; count: number }[]
  conditions: {
    entriesWithConditions: number
    temperature?: { min: number; max: number }
    wind?: { min: number; max: number }
  }
  period?: { fromMs: number; toMs: number }
}

/** Deterministic summary of what was entered. It describes the records and the
 * observation effort only; it makes no claim about the animals themselves. */
export function summarizeDeer(
  entries: readonly Observation[],
  territories: readonly Territory[],
): DeerSummary {
  const perHour = new Array<number>(24).fill(0)
  const kinds = new Map<DeerEntryKind, number>()
  const territoryCounts = new Map<string, number>()
  let animalsCounted = 0
  let withoutCount = 0
  let withConditions = 0
  let tMin = Infinity
  let tMax = -Infinity
  let wMin = Infinity
  let wMax = -Infinity
  let from = Infinity
  let to = -Infinity

  for (const o of entries) {
    if (!o.deer) continue
    const at = new Date(o.timestamp)
    perHour[at.getHours()] += 1
    from = Math.min(from, at.getTime())
    to = Math.max(to, at.getTime())
    kinds.set(o.deer.kind, (kinds.get(o.deer.kind) ?? 0) + 1)
    if (o.deer.count !== undefined) animalsCounted += o.deer.count
    else withoutCount += 1
    const territory = territories.find((t) => t.id === o.territoryId)
    const label = territory ? territory.name : UNCLASSIFIED_LABEL
    territoryCounts.set(label, (territoryCounts.get(label) ?? 0) + 1)
    if (o.conditions) {
      withConditions += 1
      tMin = Math.min(tMin, o.conditions.temperatureCelsius)
      tMax = Math.max(tMax, o.conditions.temperatureCelsius)
      wMin = Math.min(wMin, o.conditions.windSpeedKmh)
      wMax = Math.max(wMax, o.conditions.windSpeedKmh)
    }
  }

  const count = [...kinds.values()].reduce((a, b) => a + b, 0)
  return {
    entries: count,
    animalsCounted,
    withoutCount,
    kinds: DEER_KINDS.filter((k) => kinds.has(k)).map((kind) => ({
      kind,
      count: kinds.get(kind) ?? 0,
    })),
    perHour,
    territories: [...territoryCounts.entries()]
      .map(([label, n]) => ({ label, count: n }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr')),
    conditions: {
      entriesWithConditions: withConditions,
      ...(withConditions > 0
        ? {
            temperature: { min: tMin, max: tMax },
            wind: { min: wMin, max: wMax },
          }
        : {}),
    },
    ...(count > 0 ? { period: { fromMs: from, toMs: to } } : {}),
  }
}

/** Conditions read now describe NOW. They are attached only to an observation
 * made at (about) the same time: never copied onto a past sighting. */
export const CONDITIONS_MAX_GAP_MS = 30 * 60 * 1000

export function canAttachCurrentConditions(observedAtMs: number, nowMs: number): boolean {
  return Math.abs(nowMs - observedAtMs) <= CONDITIONS_MAX_GAP_MS
}

/** `YYYY-MM-DDTHH:mm` in LOCAL time, the value format of `datetime-local`. */
export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Epoch ms of a `datetime-local` value (local time); `null` when invalid. */
export function fromDatetimeLocal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, y, mo, d, h, mi] = match.map(Number)
  const date = new Date(y, mo - 1, d, h, mi)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

/** Whole count typed by the user: a positive integer up to 99, or `undefined`
 * when empty/invalid (never a default of 1). */
export function parseCount(value: string): number | undefined {
  const trimmed = value.trim()
  if (!/^\d{1,2}$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  return n >= 1 ? n : undefined
}

export const COMPASS_DIRECTIONS: readonly { label: string; degrees: number }[] = [
  { label: 'Nord', degrees: 0 },
  { label: 'Nord-est', degrees: 45 },
  { label: 'Est', degrees: 90 },
  { label: 'Sud-est', degrees: 135 },
  { label: 'Sud', degrees: 180 },
  { label: 'Sud-ouest', degrees: 225 },
  { label: 'Ouest', degrees: 270 },
  { label: 'Nord-ouest', degrees: 315 },
]

export function directionLabel(degrees: number): string {
  const nearest = COMPASS_DIRECTIONS.reduce((best, d) => {
    const delta = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
    return delta(d.degrees, degrees) < delta(best.degrees, degrees) ? d : best
  })
  return nearest.label
}

export type PositionNotice = 'none' | 'imprecise' | 'ok'

/** GPS accuracy beyond this is flagged as imprecise (same threshold as the
 * blood-search markers). */
export const IMPRECISE_ACCURACY_M = 25

export function positionNotice(
  hasPosition: boolean,
  accuracyMeters: number | undefined,
): PositionNotice {
  if (!hasPosition) return 'none'
  if (accuracyMeters === undefined || accuracyMeters > IMPRECISE_ACCURACY_M)
    return 'imprecise'
  return 'ok'
}
