import { STATUS_LABEL, windSummary } from '@/features/compare/format'
import type {
  CacheComparison,
  NearbyRecord,
  WaypointComparison,
} from '@/features/compare/types'
import { formatDistanceMeters } from '@/utils/format'
import { ResultBuilder } from './resultBuilder'
import type { SectionBuilder } from './resultBuilder'
import { categoryLabel } from './records'
import type { AssistantRecords } from './records'
import { cleanText, formatDateTime, plural } from './text'
import type { AssistantResult, EntityRef } from './types'

function rowRef(row: WaypointComparison): EntityRef {
  return {
    kind: 'waypoint',
    id: row.waypointId,
    label: cleanText(row.name, 60) || 'Point sans nom',
    coordinate: { lat: row.coordinate.lat, lng: row.coordinate.lng },
  }
}

function nearbyRef(item: NearbyRecord): EntityRef {
  return {
    kind: item.kind === 'journal' ? 'journal' : 'waypoint',
    id: item.id,
    label: cleanText(item.label, 60),
  }
}

function describeRow(
  builder: ResultBuilder,
  section: SectionBuilder,
  row: WaypointComparison,
  trackName: (id: string) => string,
) {
  const ref = rowRef(row)

  section.calc(
    `${cleanText(row.name, 60)} (${categoryLabel(row.category)}) : ${row.coverage.text}.`,
    [ref],
  )

  // Les 5 critères : le verdict est un calcul (règle appliquée à la donnée).
  for (const criterion of row.criteria) {
    section.calc(
      `${STATUS_LABEL[criterion.status]} — ${cleanText(criterion.detail, 240)}`,
      [ref],
    )
  }

  // Les valeurs qui ont servi aux verdicts.
  if (row.wind.status === 'available') {
    section.estimate(
      `Vent à ${row.wind.timeLabel} : ${windSummary(row.wind)} — valeur du modèle (${cleanText(row.wind.source, 60)}), point de grille à ${formatDistanceMeters(row.wind.sampleDistanceMeters)}.`,
      [ref],
    )
    builder.source(cleanText(row.wind.source, 60))
  } else {
    builder.missingData(
      `${cleanText(row.name, 60)} — vent : ${cleanText(row.wind.reason, 200)}`,
    )
  }
  if (row.conditions.status === 'available') {
    const c = row.conditions
    section.estimate(
      `Conditions (${cleanText(c.timeLabel, 80)}) : ${c.temperatureCelsius.toFixed(0)} °C, précipitations ${c.precipitationMm.toFixed(1).replace('.', ',')} mm, nuages ${Math.round(c.cloudCoverPercent)} %.`,
      [ref],
    )
    builder.source(cleanText(c.source, 60))
  } else {
    builder.missingData(
      `${cleanText(row.name, 60)} — conditions : ${cleanText(row.conditions.reason, 200)}`,
    )
  }
  section.estimate(`Habitat : ${cleanText(row.habitat.summary, 240)}`, [ref])

  // Enregistrements personnels : des faits, avec leurs liens.
  const o = row.observations
  const radius = `${Math.round(o.radiusMeters)} m`
  section.fact(
    `${plural(o.gameSigns.count, 'signe de gibier enregistré', 'signes de gibier enregistrés')} dans ${radius}.`,
    o.gameSigns.items.map(nearbyRef),
  )
  section.fact(
    `${plural(o.journalEntries.count, 'entrée de journal proche ou liée', 'entrées de journal proches ou liées')} (texte libre, non interprété).`,
    o.journalEntries.items.map(nearbyRef),
  )
  section.fact(
    `${plural(o.visits.count, 'trace GPS passe', 'traces GPS passent')} dans ${radius} (effort d’observation, pas un signe de gibier).`,
    o.visits.trackIds.map<EntityRef>((id) => ({
      kind: 'track',
      id,
      label: trackName(id),
    })),
  )
  builder.missingData(
    `${cleanText(row.name, 60)} — animaux observés : ${o.animalsObserved.reason}`,
  )

  if (row.position.status === 'available') {
    section.calc(
      `Distance depuis votre position : ${formatDistanceMeters(row.position.distanceMeters)} à vol d’oiseau (précision GPS ± ${Math.round(row.position.accuracyMeters)} m, ${cleanText(row.position.ageText, 40)}).`,
      [ref],
    )
  } else {
    builder.missingData(
      `${cleanText(row.name, 60)} — position : ${cleanText(row.position.reason, 200)}`,
    )
  }

  for (const text of row.advantages)
    section.calc(`Avantage : ${cleanText(text, 240)}`, [ref])
  for (const text of row.drawbacks)
    section.calc(`Inconvénient : ${cleanText(text, 240)}`, [ref])
  for (const text of row.missingData) {
    section.calc(`Donnée manquante : ${cleanText(text, 240)}`, [ref])
    builder.missingData(`${cleanText(row.name, 60)} — ${cleanText(text, 240)}`)
  }
}

/**
 * « Comparer des caches » : met en forme un `CacheComparison` DÉJÀ calculé
 * par `compareCaches` (comparateur existant). Aucun critère, aucun seuil ni
 * aucun classement n'est recalculé ici : le texte relit `ranking`, `rows`,
 * `rules` et `disclaimer` tels quels.
 */
export function describeCacheComparison(
  comparison: CacheComparison,
  options: { records?: AssistantRecords; now?: Date } = {},
): AssistantResult {
  const now = options.now ?? new Date()
  const builder = new ResultBuilder('compare-caches', 'Comparaison de caches', now)
  builder.source('Comparateur de caches de l’application (compareCaches)')
  builder.source('Enregistrements personnels de l’appareil')
  builder.used(
    plural(
      comparison.rows.length,
      'point de repère comparé',
      'points de repère comparés',
    ),
  )
  builder.date('Créneau comparé', cleanText(comparison.hour.label, 80))
  builder.date('Résultat calculé le', formatDateTime(now.toISOString()))
  for (const row of comparison.rows) {
    const t = row.dataAge.modelTime
    if (t) builder.date(`Heure du modèle (${cleanText(row.name, 40)})`, t)
  }

  const refsById = new Map(comparison.rows.map((r) => [r.waypointId, rowRef(r)]))
  const trackNames = new Map((options.records?.tracks ?? []).map((t) => [t.id, t.name]))
  const trackName = (id: string) =>
    cleanText(trackNames.get(id), 60) || 'Trace enregistrée'

  const { ranking } = comparison
  const head = builder.section(`Résultat pour ${cleanText(comparison.hour.label, 80)}`)
  head.calc(cleanText(ranking.summary, 400), [...refsById.values()])
  if (ranking.status === 'ranked') {
    for (const entry of ranking.entries) {
      const ref = refsById.get(entry.waypointId)
      head.calc(
        `Rang ${entry.rank} : ${ref?.label ?? entry.waypointId} — ${entry.metCount}/${entry.commonCount} critères communs satisfaits. ${entry.reasons.map((r) => cleanText(r, 200)).join(' ')}`.trim(),
        ref ? [ref] : [],
      )
    }
  }
  for (const excluded of ranking.excluded) {
    const ref = refsById.get(excluded.waypointId)
    head.calc(`Hors classement : ${cleanText(excluded.reason, 300)}`, ref ? [ref] : [])
  }

  for (const row of comparison.rows) {
    const section = builder.section(
      `${cleanText(row.name, 60)} — ${categoryLabel(row.category)}`,
    )
    describeRow(builder, section, row, trackName)
    for (const criterion of row.criteria) {
      builder.factor({
        group: 'Critère du comparateur',
        subjectId: row.waypointId,
        label:
          comparison.criteria.find((c) => c.id === criterion.id)?.label ?? criterion.id,
        contribution:
          criterion.status === 'met' ? 1 : criterion.status === 'not-met' ? -1 : 0,
        weight: 1,
        counted: criterion.status !== 'not-evaluable',
        nature: 'calcul',
        source: null,
      })
    }
  }

  const rules = builder.section('Règles et limites')
  for (const rule of comparison.rules) rules.calc(cleanText(rule, 400))
  rules.calc(cleanText(comparison.disclaimer, 300))
  return builder.build()
}
