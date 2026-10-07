import { ALL_TERRITORIES, filterLabel } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { formatDuration, formatKilometersFr } from '@/utils/format'
import { compassLabel } from '@/utils/terrain'
import type { Track } from '@/types'
import { mapInChunks } from './chunking'
import type { ChunkOptions } from './chunking'
import {
  circularMeanDegrees,
  dayBounds,
  journalRef,
  journalTime,
  mean,
  scopeRecords,
  trackMetrics,
  trackRef,
  trackTime,
  waypointRef,
  waypointTime,
} from './records'
import type { AssistantRecords, TrackMetrics, TrackMetricsLookup } from './records'
import { ResultBuilder } from './resultBuilder'
import { plural, quoteData } from './text'
import type { AssistantResult, EntityRef } from './types'

/**
 * Seuils explicites. En dessous, la comparaison est REFUSÉE (et le dit) :
 * quelques éléments ne permettent de dégager aucune tendance, et la
 * quantité enregistrée reflète surtout combien de fois on a noté.
 */
export const MIN_ITEMS_PER_PERIOD = 3
/** Nombre minimal d'entrées avec conditions enregistrées pour en faire la moyenne. */
export const MIN_CONDITIONS_PER_PERIOD = 3
/** Direction moyenne: en dessous, les directions sont trop dispersées pour avoir un sens. */
export const MIN_DIRECTION_CONCENTRATION = 0.5

export interface PeriodInput {
  /** Nom court affiché (« Octobre 2025 »). */
  label: string
  /** Jours locaux inclus `YYYY-MM-DD`. */
  from: string
  to: string
}

export interface PeriodStats {
  label: string
  from: string
  to: string
  waypoints: number
  tracks: number
  journal: number
  /** Total d'éléments (points + traces + entrées) : la base du seuil. */
  items: number
  distanceMeters: number
  tracksWithDistance: number
  durationMs: number
  tracksWithDuration: number
  /** Entrées avec conditions enregistrées. */
  conditionsCount: number
  meanTemperatureCelsius: number | null
  meanWindSpeedKmh: number | null
  meanCloudCoverPercent: number | null
  windDirection: { mean: number; concentration: number } | null
}

export type PeriodsStatus = 'sufficient' | 'insufficient' | 'invalid'

export interface PeriodsOutput {
  status: PeriodsStatus
  result: AssistantResult
  a: PeriodStats | null
  b: PeriodStats | null
}

export interface ComparePeriodsInput {
  a: PeriodInput
  b: PeriodInput
  records: AssistantRecords
  scope?: TerritoryFilter
  now?: Date
  metrics?: TrackMetricsLookup
}

interface Collected {
  stats: PeriodStats
  refs: EntityRef[]
}

function collect(
  period: PeriodInput,
  start: number,
  end: number,
  records: AssistantRecords,
  scope: TerritoryFilter,
  metricsOf: TrackMetricsLookup,
): Collected {
  const scoped = scopeRecords(records, scope)
  const inRange = (t: number | null) => t !== null && t >= start && t <= end
  const waypoints = scoped.waypoints.filter((w) => inRange(waypointTime(w)))
  const tracks = scoped.tracks.filter((t) => inRange(trackTime(t)))
  const journal = scoped.observations.filter((o) => inRange(journalTime(o)))

  let distance = 0
  let withDistance = 0
  let duration = 0
  let withDuration = 0
  for (const track of tracks) {
    const m: TrackMetrics = metricsOf(track)
    if (m.distanceMeters !== null) {
      distance += m.distanceMeters
      withDistance += 1
    }
    if (m.durationMs !== null) {
      duration += m.durationMs
      withDuration += 1
    }
  }
  const withConditions = journal.flatMap((o) => (o.conditions ? [o.conditions] : []))

  return {
    stats: {
      label: period.label,
      from: period.from,
      to: period.to,
      waypoints: waypoints.length,
      tracks: tracks.length,
      journal: journal.length,
      items: waypoints.length + tracks.length + journal.length,
      distanceMeters: distance,
      tracksWithDistance: withDistance,
      durationMs: duration,
      tracksWithDuration: withDuration,
      conditionsCount: withConditions.length,
      meanTemperatureCelsius: mean(withConditions.map((c) => c.temperatureCelsius)),
      meanWindSpeedKmh: mean(withConditions.map((c) => c.windSpeedKmh)),
      meanCloudCoverPercent: mean(withConditions.map((c) => c.cloudCoverPercent)),
      windDirection: circularMeanDegrees(
        withConditions.map((c) => c.windDirectionDegrees),
      ),
    },
    refs: [
      ...waypoints.map(waypointRef),
      ...tracks.map(trackRef),
      ...journal.map(journalRef),
    ],
  }
}

const num = (value: number, decimals = 0) => value.toFixed(decimals).replace('.', ',')
const signed = (value: number, decimals = 0) =>
  `${value >= 0 ? '+' : '−'}${num(Math.abs(value), decimals)}`

/**
 * « Comparer des périodes » : deux périodes choisies par l'utilisateur,
 * comptes, distances et conditions moyennes ENREGISTRÉES. Si une période a
 * moins de `MIN_ITEMS_PER_PERIOD` éléments, le résultat est « données
 * insuffisantes » : les comptes sont montrés, aucune différence n'est
 * énoncée. Jamais de tendance, de cause ni de prévision.
 */
export function comparePeriods(input: ComparePeriodsInput): PeriodsOutput {
  const now = input.now ?? new Date()
  const scope = input.scope ?? ALL_TERRITORIES
  const builder = new ResultBuilder(
    'compare-periods',
    'Comparaison de deux périodes',
    now,
  )
  builder.source('Enregistrements de l’appareil (points de repère, traces, journal)')

  const boundsA = dayBounds(input.a.from)
  const endA = dayBounds(input.a.to)
  const boundsB = dayBounds(input.b.from)
  const endB = dayBounds(input.b.to)
  const problems: string[] = []
  if (!boundsA || !endA)
    problems.push(
      `Période A invalide : « ${input.a.from.slice(0, 20)} » à « ${input.a.to.slice(0, 20)} » (attendu : AAAA-MM-JJ).`,
    )
  else if (boundsA.start > endA.end)
    problems.push('Période A : le début est après la fin.')
  if (!boundsB || !endB)
    problems.push(
      `Période B invalide : « ${input.b.from.slice(0, 20)} » à « ${input.b.to.slice(0, 20)} » (attendu : AAAA-MM-JJ).`,
    )
  else if (boundsB.start > endB.end)
    problems.push('Période B : le début est après la fin.')

  if (problems.length > 0 || !boundsA || !endA || !boundsB || !endB) {
    const section = builder.section('Périodes invalides')
    for (const p of problems) {
      section.calc(p)
      builder.missingData(p)
    }
    section.calc(
      'Aucune comparaison n’est faite tant que les deux périodes ne sont pas valides.',
    )
    return { status: 'invalid', result: builder.build(), a: null, b: null }
  }

  const metricsOf = input.metrics ?? trackMetrics
  const A = collect(input.a, boundsA.start, endA.end, input.records, scope, metricsOf)
  const B = collect(input.b, boundsB.start, endB.end, input.records, scope, metricsOf)
  const a = A.stats
  const b = B.stats

  builder.used(`Portée : ${quoteData(filterLabel(scope, input.records.territories), 60)}`)
  builder.used(
    `${plural(a.items, 'élément', 'éléments')} en période A, ${plural(b.items, 'élément', 'éléments')} en période B`,
  )
  builder.date(`Période A (${a.label})`, `${a.from} → ${a.to}`)
  builder.date(`Période B (${b.label})`, `${b.from} → ${b.to}`)

  // ------------------------------------------------------- comptes (faits)
  const counts = builder.section('Ce qui est enregistré dans chaque période')
  for (const [name, stats, refs] of [
    ['A', a, A.refs],
    ['B', b, B.refs],
  ] as const) {
    counts.fact(
      `Période ${name} (${quoteData(stats.label, 40)}, du ${stats.from} au ${stats.to}) : ${plural(stats.waypoints, 'point de repère', 'points de repère')}, ${plural(stats.tracks, 'trace', 'traces')}, ${plural(stats.journal, 'entrée de journal', 'entrées de journal')}.`,
      refs,
    )
  }

  const overlap = boundsA.start <= endB.end && boundsB.start <= endA.end
  if (overlap) {
    builder
      .section('Attention')
      .calc(
        'Les deux périodes se chevauchent : certains éléments sont comptés dans les deux.',
      )
  }

  // ---------------------------------------------------------------- seuil
  const insufficient = a.items < MIN_ITEMS_PER_PERIOD || b.items < MIN_ITEMS_PER_PERIOD
  if (insufficient) {
    const section = builder.section('Données insuffisantes')
    section.calc(
      `Données insuffisantes : le seuil est de ${MIN_ITEMS_PER_PERIOD} éléments par période (points, traces et entrées confondus) ; la période A en a ${a.items} et la période B en a ${b.items}. Aucune comparaison n’est faite : aussi peu d’éléments ne permettent de conclure ni à une différence ni à une tendance.`,
    )
    builder.missingData(
      `Période ${a.items < MIN_ITEMS_PER_PERIOD ? 'A' : ''}${a.items < MIN_ITEMS_PER_PERIOD && b.items < MIN_ITEMS_PER_PERIOD ? ' et ' : ''}${b.items < MIN_ITEMS_PER_PERIOD ? 'B' : ''} : moins de ${MIN_ITEMS_PER_PERIOD} éléments.`,
    )
    return { status: 'insufficient', result: builder.build(), a, b }
  }

  // ------------------------------------------------------- comparaison
  const cmp = builder.section('Comparaison des quantités (calculée)')
  cmp.calc(
    `Éléments enregistrés : ${a.items} en période A, ${b.items} en période B (écart ${signed(a.items - b.items)}).`,
  )
  cmp.calc(
    `Points de repère : ${a.waypoints} contre ${b.waypoints} ; traces : ${a.tracks} contre ${b.tracks} ; entrées de journal : ${a.journal} contre ${b.journal}.`,
  )
  if (a.tracksWithDistance > 0 && b.tracksWithDistance > 0) {
    cmp.calc(
      `Distance parcourue (traces avec distance) : ${formatKilometersFr(a.distanceMeters)} contre ${formatKilometersFr(b.distanceMeters)}.`,
    )
  } else {
    const text =
      'Distance parcourue : non comparable (une période n’a aucune trace avec distance).'
    cmp.calc(text)
    builder.missingData(text)
  }
  if (a.tracksWithDuration > 0 && b.tracksWithDuration > 0) {
    cmp.calc(
      `Durée des traces terminées : ${formatDuration(a.durationMs)} contre ${formatDuration(b.durationMs)}.`,
    )
  }

  const cond = builder.section(
    'Conditions enregistrées (moyennes des entrées de journal)',
  )
  if (
    a.conditionsCount < MIN_CONDITIONS_PER_PERIOD ||
    b.conditionsCount < MIN_CONDITIONS_PER_PERIOD
  ) {
    const text = `Conditions : données insuffisantes — seuil de ${MIN_CONDITIONS_PER_PERIOD} entrées avec conditions par période (A : ${a.conditionsCount}, B : ${b.conditionsCount}). Aucune moyenne comparée.`
    cond.calc(text)
    builder.missingData(text)
  } else {
    const rows: [string, number | null, number | null, number, string][] = [
      [
        'Température moyenne',
        a.meanTemperatureCelsius,
        b.meanTemperatureCelsius,
        1,
        ' °C',
      ],
      ['Vitesse moyenne du vent', a.meanWindSpeedKmh, b.meanWindSpeedKmh, 1, ' km/h'],
      ['Nébulosité moyenne', a.meanCloudCoverPercent, b.meanCloudCoverPercent, 0, ' %'],
    ]
    for (const [label, left, right, decimals, unit] of rows) {
      if (left === null || right === null) continue
      cond.calc(
        `${label} : ${num(left, decimals)}${unit} contre ${num(right, decimals)}${unit} (écart ${signed(left - right, decimals)}${unit}), sur ${a.conditionsCount} et ${b.conditionsCount} entrée(s).`,
      )
    }
    const dirA = a.windDirection
    const dirB = b.windDirection
    if (
      dirA &&
      dirB &&
      dirA.concentration >= MIN_DIRECTION_CONCENTRATION &&
      dirB.concentration >= MIN_DIRECTION_CONCENTRATION
    ) {
      cond.calc(
        `Direction moyenne du vent (moyenne circulaire) : ${compassLabel(dirA.mean)} (${Math.round(dirA.mean)}°) contre ${compassLabel(dirB.mean)} (${Math.round(dirB.mean)}°).`,
      )
    } else {
      const text =
        'Direction du vent : directions trop dispersées dans au moins une période pour en dégager une moyenne significative.'
      cond.calc(text)
      builder.missingData(text)
    }
  }

  builder
    .section('Limites')
    .calc(
      'Ces écarts décrivent deux périodes précises ; ce n’est ni une tendance, ni une cause, ni une prévision. Le nombre d’éléments enregistrés reflète d’abord combien de fois vous avez noté, pas l’activité du gibier.',
    )
  return { status: 'sufficient', result: builder.build(), a, b }
}

/** Même résultat que `comparePeriods`, avec les mesures de traces calculées
 * par tranches (annulable). */
export async function comparePeriodsAsync(
  input: ComparePeriodsInput,
  options: ChunkOptions = {},
): Promise<PeriodsOutput> {
  const scoped = scopeRecords(input.records, input.scope ?? ALL_TERRITORIES)
  const cache = new Map<string, TrackMetrics>()
  await mapInChunks(
    scoped.tracks,
    (track: Track) => {
      cache.set(track.id, trackMetrics(track))
      return undefined
    },
    options,
  )
  return comparePeriods({
    ...input,
    metrics: (track) => cache.get(track.id) ?? trackMetrics(track),
  })
}
