import { ALL_TERRITORIES, filterLabel } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { haversineMeters } from '@/utils/geo'
import { formatDistanceMeters } from '@/utils/format'
import { compassLabel } from '@/utils/terrain'
import type { Coordinate, Observation, Track, Waypoint, WaypointCategory } from '@/types'
import { mapInChunks } from './chunking'
import type { ChunkOptions } from './chunking'
import {
  categoryLabel,
  dayBounds,
  journalRef,
  journalTime,
  scopeRecords,
  trackRef,
  trackTime,
  waypointRef,
  waypointTime,
} from './records'
import type { AssistantRecords } from './records'
import { ResultBuilder } from './resultBuilder'
import { foldForSearch, formatDay, plural, quoteData } from './text'
import type { AssistantResult, EntityKind, EntityRef } from './types'

/** Types d'éléments que la recherche parcourt (une cellule d'analyse n'est pas un enregistrement). */
export type SearchKind = Exclude<EntityKind, 'cell'>

/** Nombre maximal de résultats détaillés (le total exact reste affiché). */
export const SEARCH_RESULT_LIMIT = 50
export const TEXT_QUERY_MAX = 120

export interface WindCriteria {
  minSpeedKmh?: number | null
  maxSpeedKmh?: number | null
  /** Direction D'OÙ vient le vent (0 = nord), avec une tolérance en degrés. */
  fromDirection?: { degrees: number; toleranceDegrees: number } | null
}

export interface SearchCriteria {
  /** Texte littéral (nom ou notes) ; sans accents ni casse, jamais une regex. */
  text?: string
  /** Types d'éléments cherchés ; vide ou absent = tous. */
  kinds?: SearchKind[]
  category?: WaypointCategory | null
  /** Jours locaux inclus `YYYY-MM-DD`. */
  from?: string | null
  to?: string | null
  territory?: TerritoryFilter
  near?: { center: Coordinate; radiusMeters: number } | null
  /** `true` : seulement avec photo ; `false` : seulement sans ; `null` : peu importe. */
  hasPhoto?: boolean | null
  /** Conditions de vent enregistrées dans l'entrée de journal (`conditions`). */
  wind?: WindCriteria | null
  limit?: number
}

export interface SearchHit {
  ref: EntityRef
  kind: SearchKind
  /** ISO de la date représentative. */
  date: string
  time: number
  distanceMeters: number | null
  photoCount: number
  conditionsText: string | null
  /** Titre court, déjà nettoyé. */
  title: string
}

export interface SearchOutput {
  result: AssistantResult
  hits: SearchHit[]
  /** Nombre total de correspondances (avant plafonnement). */
  total: number
  /** Critères invalides (jour mal formé, rayon…), jamais ignorés en silence. */
  errors: string[]
}

type Candidate =
  | { kind: 'waypoint'; item: Waypoint }
  | { kind: 'track'; item: Track }
  | { kind: 'journal'; item: Observation }

interface Compiled {
  text: string | null
  kinds: Set<SearchKind>
  category: WaypointCategory | null
  fromMs: number | null
  toMs: number | null
  near: { center: Coordinate; radiusMeters: number } | null
  hasPhoto: boolean | null
  wind: WindCriteria | null
  errors: string[]
}

function hasWindCriteria(wind: WindCriteria | null | undefined): wind is WindCriteria {
  if (!wind) return false
  return (
    (wind.minSpeedKmh ?? null) !== null ||
    (wind.maxSpeedKmh ?? null) !== null ||
    (wind.fromDirection ?? null) !== null
  )
}

export function compileCriteria(criteria: SearchCriteria): Compiled {
  const errors: string[] = []
  const text = criteria.text
    ? foldForSearch(criteria.text.trim().slice(0, TEXT_QUERY_MAX))
    : ''

  let fromMs: number | null = null
  let toMs: number | null = null
  if (criteria.from) {
    const bounds = dayBounds(criteria.from)
    if (bounds) fromMs = bounds.start
    else
      errors.push(
        `Date de début invalide : « ${criteria.from.slice(0, 20)} » (attendu : AAAA-MM-JJ).`,
      )
  }
  if (criteria.to) {
    const bounds = dayBounds(criteria.to)
    if (bounds) toMs = bounds.end
    else
      errors.push(
        `Date de fin invalide : « ${criteria.to.slice(0, 20)} » (attendu : AAAA-MM-JJ).`,
      )
  }
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    errors.push('La date de début est après la date de fin : aucune période.')
  }

  let near = criteria.near ?? null
  if (near) {
    const valid =
      Number.isFinite(near.radiusMeters) &&
      near.radiusMeters > 0 &&
      Number.isFinite(near.center.lat) &&
      Number.isFinite(near.center.lng)
    if (!valid) {
      errors.push('Proximité invalide : un point et un rayon positif sont requis.')
      near = null
    }
  }

  const wind = hasWindCriteria(criteria.wind) ? criteria.wind : null
  if (
    wind &&
    wind.minSpeedKmh != null &&
    wind.maxSpeedKmh != null &&
    wind.minSpeedKmh > wind.maxSpeedKmh
  ) {
    errors.push('Vent : la vitesse minimale dépasse la vitesse maximale.')
  }

  return {
    text: text || null,
    kinds: new Set(criteria.kinds && criteria.kinds.length > 0 ? criteria.kinds : []),
    category: criteria.category ?? null,
    fromMs,
    toMs,
    near,
    hasPhoto: criteria.hasPhoto ?? null,
    wind,
    errors,
  }
}

/** Quels types peuvent répondre aux critères posés (et pourquoi les autres sont exclus). */
function eligibleKinds(c: Compiled): { kinds: Set<SearchKind>; notes: string[] } {
  const all: SearchKind[] = ['waypoint', 'track', 'journal']
  let kinds = new Set<SearchKind>(c.kinds.size > 0 ? [...c.kinds] : all)
  const notes: string[] = []
  const restrict = (allowed: SearchKind[], why: string) => {
    const next = new Set([...kinds].filter((k) => allowed.includes(k)))
    if (next.size < kinds.size) notes.push(why)
    kinds = next
  }
  if (c.category)
    restrict(
      ['waypoint'],
      'Une catégorie ne s’applique qu’aux points de repère : traces et entrées de journal exclues.',
    )
  if (c.wind) {
    restrict(
      ['journal'],
      'Les conditions de vent sont enregistrées seulement dans le journal : points et traces exclus (ils n’ont pas de conditions enregistrées).',
    )
  }
  if (c.hasPhoto !== null) {
    restrict(
      ['waypoint', 'journal'],
      'Les traces n’ont pas de photos : exclues du filtre « photo ».',
    )
  }
  return { kinds, notes }
}

function conditionsText(o: Observation): string | null {
  const c = o.conditions
  if (!c) return null
  return `vent ${compassLabel(c.windDirectionDegrees)} (${Math.round(c.windDirectionDegrees)}°) ${Math.round(c.windSpeedKmh)} km/h, ${Math.round(c.temperatureCelsius)} °C, nuages ${Math.round(c.cloudCoverPercent)} %`
}

function angleDifference(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360
  return d > 180 ? 360 - d : d
}

function matchesWind(o: Observation, wind: WindCriteria): boolean {
  const c = o.conditions
  if (!c) return false
  if (wind.minSpeedKmh != null && c.windSpeedKmh < wind.minSpeedKmh) return false
  if (wind.maxSpeedKmh != null && c.windSpeedKmh > wind.maxSpeedKmh) return false
  if (wind.fromDirection) {
    const { degrees, toleranceDegrees } = wind.fromDirection
    if (angleDifference(c.windDirectionDegrees, degrees) > toleranceDegrees) return false
  }
  return true
}

function inPeriod(time: number | null, c: Compiled): boolean {
  if (c.fromMs === null && c.toMs === null) return true
  // Un élément sans date valide ne peut pas être placé dans une période.
  if (time === null) return false
  if (c.fromMs !== null && time < c.fromMs) return false
  if (c.toMs !== null && time > c.toMs) return false
  return true
}

function minDistanceToTrack(track: Track, center: Coordinate): number | null {
  if (track.points.length === 0) return null
  let best = Infinity
  for (const p of track.points) {
    const d = haversineMeters(center, p)
    if (d < best) best = d
  }
  return best
}

/** Évalue UN élément : renvoie la correspondance ou `undefined`. Pure. */
export function evaluateCandidate(
  candidate: Candidate,
  c: Compiled,
  kinds: ReadonlySet<SearchKind>,
): SearchHit | undefined {
  if (!kinds.has(candidate.kind)) return undefined

  if (candidate.kind === 'waypoint') {
    const w = candidate.item
    if (c.category && w.category !== c.category) return undefined
    if (c.text && !foldForSearch(`${w.name}\n${w.notes ?? ''}`).includes(c.text))
      return undefined
    const time = waypointTime(w)
    if (!inPeriod(time, c)) return undefined
    const photoCount = w.photoIds?.length ?? 0
    if (c.hasPhoto !== null && photoCount > 0 !== c.hasPhoto) return undefined
    let distance: number | null = null
    if (c.near) {
      distance = haversineMeters(c.near.center, w.coordinate)
      if (distance > c.near.radiusMeters) return undefined
    }
    return {
      ref: waypointRef(w),
      kind: 'waypoint',
      date: w.createdAt,
      time: time ?? 0,
      distanceMeters: distance,
      photoCount,
      conditionsText: null,
      title: `Point de repère ${quoteData(w.name)} — ${categoryLabel(w.category)}`,
    }
  }

  if (candidate.kind === 'track') {
    const t = candidate.item
    if (c.text && !foldForSearch(`${t.name}\n${t.notes ?? ''}`).includes(c.text))
      return undefined
    const time = trackTime(t)
    if (!inPeriod(time, c)) return undefined
    let distance: number | null = null
    if (c.near) {
      distance = minDistanceToTrack(t, c.near.center)
      if (distance === null || distance > c.near.radiusMeters) return undefined
    }
    return {
      ref: trackRef(t),
      kind: 'track',
      date: t.startedAt,
      time: time ?? 0,
      distanceMeters: distance,
      photoCount: 0,
      conditionsText: null,
      title: `Trace ${quoteData(t.name)}`,
    }
  }

  const o = candidate.item
  if (c.text && !foldForSearch(o.notes).includes(c.text)) return undefined
  const time = journalTime(o)
  if (!inPeriod(time, c)) return undefined
  const photoCount = o.photoIds?.length ?? 0
  if (c.hasPhoto !== null && photoCount > 0 !== c.hasPhoto) return undefined
  if (c.wind && !matchesWind(o, c.wind)) return undefined
  let distance: number | null = null
  if (c.near) {
    distance = haversineMeters(c.near.center, o.coordinate)
    if (distance > c.near.radiusMeters) return undefined
  }
  return {
    ref: journalRef(o),
    kind: 'journal',
    date: o.timestamp,
    time: time ?? 0,
    distanceMeters: distance,
    photoCount,
    conditionsText: conditionsText(o),
    title: `Entrée de journal ${quoteData(o.notes, 50)}`,
  }
}

function candidatesOf(
  records: AssistantRecords,
  criteria: SearchCriteria,
  kinds: ReadonlySet<SearchKind>,
): { list: Candidate[]; windMissing: number } {
  const scoped = scopeRecords(records, criteria.territory ?? ALL_TERRITORIES)
  const list: Candidate[] = []
  if (kinds.has('waypoint'))
    for (const item of scoped.waypoints) list.push({ kind: 'waypoint', item })
  if (kinds.has('track'))
    for (const item of scoped.tracks) list.push({ kind: 'track', item })
  if (kinds.has('journal'))
    for (const item of scoped.observations) list.push({ kind: 'journal', item })
  const windMissing = hasWindCriteria(criteria.wind)
    ? scoped.observations.filter((o) => !o.conditions).length
    : 0
  return { list, windMissing }
}

function sortHits(hits: SearchHit[]): SearchHit[] {
  // Du plus récent au plus ancien ; égalité : identifiant (ordre stable).
  return [...hits].sort((a, b) => b.time - a.time || a.ref.id.localeCompare(b.ref.id))
}

function buildOutput(
  records: AssistantRecords,
  criteria: SearchCriteria,
  compiled: Compiled,
  notes: string[],
  windMissing: number,
  rawHits: SearchHit[],
  now: Date,
): SearchOutput {
  const hits = sortHits(rawHits)
  const limit = Math.max(1, criteria.limit ?? SEARCH_RESULT_LIMIT)
  const shown = hits.slice(0, limit)
  const builder = new ResultBuilder('history-search', 'Recherche dans l’historique', now)
  builder.source('Enregistrements de l’appareil (points de repère, traces, journal)')
  builder.used(
    `${records.waypoints.length} points de repère, ${records.tracks.length} traces, ${records.observations.length} entrées de journal parcourus`,
  )

  const summary = builder.section('Critères appliqués')
  const territory = criteria.territory ?? ALL_TERRITORIES
  summary.calc(`Territoire : ${filterLabel(territory, records.territories)}.`)
  if (compiled.text)
    summary.calc(
      `Texte contenant ${quoteData(criteria.text?.trim(), 60)} (sans accents ni casse).`,
    )
  if (compiled.category) summary.calc(`Catégorie : ${categoryLabel(compiled.category)}.`)
  if (compiled.fromMs !== null || compiled.toMs !== null) {
    summary.calc(
      `Période : du ${criteria.from ?? 'début'} au ${criteria.to ?? 'jour le plus récent'} (inclus).`,
    )
  }
  if (compiled.near) {
    summary.calc(
      `À moins de ${formatDistanceMeters(compiled.near.radiusMeters)} de ${compiled.near.center.lat.toFixed(4)}, ${compiled.near.center.lng.toFixed(4)} (pour une trace : son point le plus proche).`,
    )
  }
  if (compiled.hasPhoto !== null) {
    summary.calc(compiled.hasPhoto ? 'Avec au moins une photo.' : 'Sans photo.')
  }
  if (compiled.wind) {
    const parts: string[] = []
    if (compiled.wind.minSpeedKmh != null)
      parts.push(`au moins ${compiled.wind.minSpeedKmh} km/h`)
    if (compiled.wind.maxSpeedKmh != null)
      parts.push(`au plus ${compiled.wind.maxSpeedKmh} km/h`)
    if (compiled.wind.fromDirection) {
      parts.push(
        `de direction ${Math.round(compiled.wind.fromDirection.degrees)}° ± ${Math.round(compiled.wind.fromDirection.toleranceDegrees)}°`,
      )
    }
    summary.calc(`Vent enregistré dans l’entrée : ${parts.join(', ')}.`)
  }
  for (const note of notes) summary.calc(note)
  for (const error of compiled.errors) {
    summary.calc(`Critère invalide : ${error}`)
    builder.missingData(error)
  }
  if (windMissing > 0) {
    const text = `${plural(windMissing, 'entrée de journal sans conditions enregistrées', 'entrées de journal sans conditions enregistrées')} : non évaluable(s) pour le vent, donc absente(s) des résultats.`
    summary.calc(text)
    builder.missingData(text)
  }

  const results = builder.section(
    hits.length === 0
      ? 'Résultats'
      : `Résultats — ${hits.length} (du plus récent au plus ancien)`,
  )
  if (hits.length === 0) {
    results.fact('Aucun élément ne correspond à ces critères.')
  }
  for (const hit of shown) {
    const bits = [`${hit.title} — ${formatDay(hit.date)}`]
    if (hit.photoCount > 0) bits.push(plural(hit.photoCount, 'photo', 'photos'))
    if (hit.conditionsText) bits.push(`conditions enregistrées : ${hit.conditionsText}`)
    if (hit.distanceMeters !== null) {
      bits.push(`à ${formatDistanceMeters(hit.distanceMeters)} du point choisi`)
    }
    // Une distance calculée rend l'énoncé « calcul » ; sinon c'est un fait enregistré.
    results.add(
      bits.join(' — '),
      hit.distanceMeters !== null ? 'calcul' : 'fait enregistré',
      [hit.ref],
    )
  }
  if (hits.length > shown.length) {
    results.calc(
      `${hits.length - shown.length} autre(s) résultat(s) non affiché(s) : affinez les critères (limite d’affichage : ${limit}).`,
    )
  }
  return {
    result: builder.build(),
    hits: shown,
    total: hits.length,
    errors: compiled.errors,
  }
}

/**
 * « Rechercher l'historique par critères » sur points de repère, traces et
 * entrées de journal : texte, catégorie, période, territoire, proximité,
 * présence de photo et conditions de vent enregistrées. Résultats triés
 * par date décroissante, chacun avec son lien. Un critère qui ne peut pas
 * s'appliquer à un type d'élément l'exclut ET le dit.
 */
export function searchHistory(
  records: AssistantRecords,
  criteria: SearchCriteria,
  now: Date = new Date(),
): SearchOutput {
  const compiled = compileCriteria(criteria)
  const { kinds, notes } = eligibleKinds(compiled)
  const invalidRange = compiled.errors.some((e) =>
    e.startsWith('La date de début est après'),
  )
  const { list, windMissing } = candidatesOf(records, criteria, kinds)
  const raw: SearchHit[] = []
  if (!invalidRange) {
    for (const candidate of list) {
      const hit = evaluateCandidate(candidate, compiled, kinds)
      if (hit) raw.push(hit)
    }
  }
  return buildOutput(records, criteria, compiled, notes, windMissing, raw, now)
}

/** Même résultat que `searchHistory`, calculé par tranches (annulable). */
export async function searchHistoryAsync(
  records: AssistantRecords,
  criteria: SearchCriteria,
  options: ChunkOptions & { at?: Date } = {},
): Promise<SearchOutput> {
  const compiled = compileCriteria(criteria)
  const { kinds, notes } = eligibleKinds(compiled)
  const invalidRange = compiled.errors.some((e) =>
    e.startsWith('La date de début est après'),
  )
  const { list, windMissing } = candidatesOf(records, criteria, kinds)
  const raw = invalidRange
    ? []
    : await mapInChunks(
        list,
        (candidate) => evaluateCandidate(candidate, compiled, kinds),
        options,
      )
  return buildOutput(
    records,
    criteria,
    compiled,
    notes,
    windMissing,
    raw,
    options.at ?? new Date(),
  )
}
