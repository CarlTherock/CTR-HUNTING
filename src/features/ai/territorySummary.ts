import { filterLabel } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { formatKilometersFr } from '@/utils/format'
import { formatDuration } from '@/utils/format'
import { mapInChunks } from './chunking'
import type { ChunkOptions } from './chunking'
import {
  categoryLabel,
  journalRef,
  journalTime,
  scopeRecords,
  trackMetrics,
  trackRef,
  trackTime,
  waypointRef,
  waypointTime,
} from './records'
import type { AssistantRecords, TrackMetrics, TrackMetricsLookup } from './records'
import { ResultBuilder } from './resultBuilder'
import { formatDay, plural, quoteData } from './text'
import type { AssistantResult, EntityRef } from './types'
import type { Track } from '@/types'

export const RECENT_ITEMS = 5

export interface TerritorySummaryInput {
  /** Quel territoire : le même filtre que les listes (tous / un territoire /
   * non classé / archivés). */
  scope: TerritoryFilter
  records: AssistantRecords
  now?: Date
  /** Mesures de traces déjà calculées (par tranches) ; sinon calculées ici. */
  metrics?: TrackMetricsLookup
}

interface Dated {
  time: number
  ref: EntityRef
  what: string
}

/**
 * « Résumer les observations d'un territoire » : comptes par type, traces
 * (distance et durée totales), entrées de journal, photos rattachées,
 * période couverte et derniers éléments, chacun avec son identifiant
 * cliquable. Tout est compté dans les enregistrements de l'appareil ; rien
 * n'est déduit du texte des notes.
 */
export function summarizeTerritory(input: TerritorySummaryInput): AssistantResult {
  const now = input.now ?? new Date()
  const scopeName = filterLabel(input.scope, input.records.territories)
  const builder = new ResultBuilder(
    'territory-summary',
    `Résumé — ${quoteData(scopeName, 60)}`,
    now,
  )
  builder.source('Enregistrements de l’appareil (points de repère, traces, journal)')
  const { waypoints, tracks, observations } = scopeRecords(input.records, input.scope)
  const metricsOf = input.metrics ?? trackMetrics

  builder.used(plural(waypoints.length, 'point de repère', 'points de repère'))
  builder.used(plural(tracks.length, 'trace GPS', 'traces GPS'))
  builder.used(plural(observations.length, 'entrée de journal', 'entrées de journal'))

  const total = waypoints.length + tracks.length + observations.length
  if (total === 0) {
    builder
      .section('Contenu')
      .fact(`Aucun élément enregistré pour ${quoteData(scopeName, 60)}.`)
    builder.missingData(
      'Aucun point de repère, trace ni entrée de journal dans cette portée.',
    )
    return builder.build()
  }

  // ------------------------------------------------------------- contenu
  const content = builder.section('Contenu')
  const byCategory = new Map<string, typeof waypoints>()
  for (const w of waypoints) {
    const list = byCategory.get(w.category) ?? []
    list.push(w)
    byCategory.set(w.category, list)
  }
  content.fact(
    waypoints.length === 0
      ? 'Aucun point de repère.'
      : `${plural(waypoints.length, 'point de repère', 'points de repère')}, par catégorie :`,
  )
  const categories = [...byCategory.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  )
  for (const [category, list] of categories) {
    content.fact(
      `${categoryLabel(category as (typeof waypoints)[number]['category'])} : ${list.length}`,
      list.map(waypointRef),
    )
  }

  // ------------------------------------------------------------- traces
  const trackSection = builder.section('Traces')
  if (tracks.length === 0) {
    trackSection.fact('Aucune trace GPS.')
  } else {
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
    trackSection.fact(
      `${plural(tracks.length, 'trace GPS', 'traces GPS')}.`,
      tracks.map(trackRef),
    )
    trackSection.calc(
      withDistance === 0
        ? 'Distance totale : indisponible (aucune trace n’a de distance ni assez de points).'
        : `Distance totale : ${formatKilometersFr(distance)} (${withDistance}/${tracks.length} trace(s) avec une distance).`,
    )
    trackSection.calc(
      withDuration === 0
        ? 'Durée totale : indisponible (aucune trace terminée avec des dates valides).'
        : `Durée totale : ${formatDuration(duration)} (${withDuration}/${tracks.length} trace(s) terminée(s) avec des dates valides).`,
    )
    if (withDistance < tracks.length) {
      builder.missingData(
        `${tracks.length - withDistance} trace(s) sans distance calculable : non comptée(s) dans la distance totale.`,
      )
    }
    if (withDuration < tracks.length) {
      builder.missingData(
        `${tracks.length - withDuration} trace(s) sans durée connue (en cours, interrompue ou dates invalides) : non comptée(s) dans la durée totale.`,
      )
    }
  }

  // ------------------------------------------------------------- journal
  const journal = builder.section('Journal et photos')
  const withConditions = observations.filter((o) => o.conditions !== undefined)
  journal.fact(
    observations.length === 0
      ? 'Aucune entrée de journal.'
      : `${plural(observations.length, 'entrée de journal', 'entrées de journal')} (texte libre, jamais interprété), dont ${withConditions.length} avec des conditions enregistrées.`,
    observations.map(journalRef),
  )
  const waypointPhotos = waypoints.reduce((n, w) => n + (w.photoIds?.length ?? 0), 0)
  const journalPhotos = observations.reduce((n, o) => n + (o.photoIds?.length ?? 0), 0)
  journal.fact(
    `${plural(waypointPhotos + journalPhotos, 'photo rattachée', 'photos rattachées')} (${waypointPhotos} à des points de repère, ${journalPhotos} à des entrées de journal), d’après les listes de photos de chaque élément.`,
  )

  // ------------------------------------------------------------- période
  const dated: Dated[] = []
  for (const w of waypoints) {
    const time = waypointTime(w)
    if (time !== null) {
      dated.push({
        time,
        ref: waypointRef(w),
        what: `Point de repère ${quoteData(w.name)}`,
      })
    }
  }
  for (const t of tracks) {
    const time = trackTime(t)
    if (time !== null) {
      dated.push({ time, ref: trackRef(t), what: `Trace ${quoteData(t.name)}` })
    }
  }
  for (const o of observations) {
    const time = journalTime(o)
    if (time !== null) {
      dated.push({
        time,
        ref: journalRef(o),
        what: `Entrée de journal ${quoteData(o.notes, 50)}`,
      })
    }
  }
  const period = builder.section('Période couverte')
  if (dated.length === 0) {
    period.fact('Aucune date valide : période indisponible.')
    builder.missingData('Aucun élément de cette portée n’a de date valide.')
  } else {
    const times = dated.map((d) => d.time)
    const first = new Date(Math.min(...times)).toISOString()
    const last = new Date(Math.max(...times)).toISOString()
    period.fact(
      `Du ${formatDay(first)} au ${formatDay(last)} (dates de création des points, de début des traces et des entrées).`,
    )
    builder.date('Premier élément', formatDay(first))
    builder.date('Dernier élément', formatDay(last))
    if (dated.length < total) {
      builder.missingData(
        `${total - dated.length} élément(s) sans date valide, ignoré(s) pour la période.`,
      )
    }
  }

  const recent = builder.section(`Derniers éléments (${RECENT_ITEMS} au plus)`)
  const latest = [...dated]
    .sort((a, b) => b.time - a.time || a.ref.id.localeCompare(b.ref.id))
    .slice(0, RECENT_ITEMS)
  if (latest.length === 0) recent.fact('Aucun élément daté.')
  for (const item of latest) {
    recent.fact(`${item.what} — ${formatDay(new Date(item.time).toISOString())}`, [
      item.ref,
    ])
  }

  return builder.build()
}

/**
 * Variante asynchrone pour de grosses collections : les mesures de traces
 * (distance recalculée depuis les points) sont calculées par tranches, en
 * rendant la main au navigateur, et le calcul s'arrête si `signal` est
 * annulé (`AbortError`). Le résultat est identique à `summarizeTerritory`.
 */
export async function summarizeTerritoryAsync(
  input: TerritorySummaryInput,
  options: ChunkOptions = {},
): Promise<AssistantResult> {
  const { tracks } = scopeRecords(input.records, input.scope)
  const cache = new Map<string, TrackMetrics>()
  await mapInChunks(
    tracks,
    (track: Track) => {
      cache.set(track.id, trackMetrics(track))
      return undefined
    },
    options,
  )
  return summarizeTerritory({
    ...input,
    metrics: (track) => cache.get(track.id) ?? trackMetrics(track),
  })
}
