import { vegetationAnalyzer, unavailableResult } from '@/utils/analyzers'
import { isCovered } from '@/utils/analysisFamilies'
import { buildHourOptions, resolveHour, windReadingForHour } from '@/utils/analysisTime'
import type { HourSelection } from '@/utils/analysisTime'
import { haversineMeters } from '@/utils/geo'
import { compassLabel } from '@/utils/terrain'
import { isOptimalWind, nearestSample } from '@/utils/windField'
import type { VegetationSample, Waypoint, WindHourlyReading } from '@/types'
import {
  CRITERIA,
  CRITERION_ORDER,
  DISCLAIMER,
  HABITAT_NEUTRAL_INDEX,
  HEAVY_PRECIPITATION_MM,
  MAX_WAYPOINTS,
  MIN_COMMON_CRITERIA,
  MIN_EVALUABLE_CRITERIA,
  MIN_WAYPOINTS,
  RANKING_RULES,
  WIND_CALM_KMH,
  WIND_STRONG_KMH,
  criterionDefinition,
} from './criteria'
import { positionFor } from './position'
import { summarizeObservations } from './records'
import type {
  CacheComparison,
  CompareCachesInput,
  ConditionsValue,
  Coverage,
  CriterionEvaluation,
  CriterionId,
  DataAge,
  HabitatValue,
  HourInfo,
  Ranking,
  RankEntry,
  SourceState,
  Unavailable,
  WaypointComparison,
  WindPreference,
  WindValue,
} from './types'

/**
 * `compareCaches` — la logique PURE du comparateur de caches (aucune
 * requête, aucune lecture d'état global : tout arrive par `input`). Elle
 * réutilise les analyseurs de la carte de potentiel (végétation,
 * observations) et les mêmes règles de vent/précipitations.
 *
 * Principes (voir `criteria.ts` pour les règles affichées) :
 * - un critère sans donnée est « non évaluable » — jamais remplacé par une
 *   valeur neutre, ni pour ni contre le point ;
 * - le tri compare seulement les critères évaluables pour TOUS les points
 *   classés ; un point trop peu documenté n'est pas classé ;
 * - le résultat est un tri par critères documentés, jamais un score caché
 *   ni une prévision de réussite.
 */

const WIND_SOURCE = 'Open-Meteo (modèle), point de grille le plus proche'
const NO_TERRAIN_REASON =
  'Terrain non évalué depuis cette page : la pente et l’exposition viennent de la tuile d’élévation chargée sur la carte.'

// ------------------------------------------------------------------ utilitaires

function unavailable(reason: string): Unavailable {
  return { status: 'unavailable', reason }
}

function sourceReason(state: SourceState, what: string): string | null {
  switch (state.status) {
    case 'loading':
      return `${what} : chargement en cours.`
    case 'error':
      return `${what} indisponible : ${state.reason}`
    case 'skipped':
      return `${what} non demandé : ${state.reason}`
    case 'ok':
      return null
  }
}

function hourInfo(input: CompareCachesInput, hour: HourSelection): HourInfo {
  const option = buildHourOptions(input.windField, null, input.now).find(
    (o) => o.hourKey === hour.hourKey,
  )
  return {
    hourKey: hour.hourKey,
    kind: hour.kind,
    label: option?.label ?? hour.timeLabel,
  }
}

function currentLabel(hour: HourSelection): string {
  return hour.kind === 'current'
    ? 'Actuel (heure en cours, valeur horaire du modèle)'
    : hour.timeLabel
}

function windValueFor(
  waypoint: Waypoint,
  input: CompareCachesInput,
  hour: HourSelection,
): { wind: WindValue | Unavailable; reading: WindHourlyReading | null } {
  const stateReason = sourceReason(input.wind, 'Vent')
  if (!input.windField) {
    return {
      wind: unavailable(stateReason ?? 'Aucune donnée de vent chargée.'),
      reading: null,
    }
  }
  const sample = nearestSample(input.windField, waypoint.coordinate)
  const reading = windReadingForHour(sample?.hourly, hour)
  if (!sample || !reading) {
    return {
      wind: unavailable(
        `L’heure ${hour.clock} n’est pas dans les données de vent chargées (aucune extrapolation).`,
      ),
      reading: null,
    }
  }
  return {
    reading,
    wind: {
      status: 'available',
      reading,
      sampleDistanceMeters: haversineMeters(waypoint.coordinate, sample.coordinate),
      sampleKey: `${sample.coordinate.lat.toFixed(4)},${sample.coordinate.lng.toFixed(4)}`,
      source: WIND_SOURCE,
      dataTime: reading.time,
      timeLabel: currentLabel(hour),
    },
  }
}

function windPreferenceFor(
  waypoint: Waypoint,
  reading: WindHourlyReading | null,
): WindPreference {
  const directions = waypoint.optimalWindDirections ?? []
  if (directions.length === 0) {
    return {
      directions,
      compatible: null,
      note: 'Aucune direction de vent préférée enregistrée sur ce point (à définir dans sa fiche).',
    }
  }
  const list = directions.map((d) => compassLabel(d)).join(', ')
  if (!reading) {
    return {
      directions,
      compatible: null,
      note: `Directions préférées : ${list}. Vent indisponible à cette heure : compatibilité non évaluable.`,
    }
  }
  const compatible = isOptimalWind(reading.directionDegrees, directions)
  return {
    directions,
    compatible,
    note: compatible
      ? `Vent du ${compassLabel(reading.directionDegrees)} : fait partie des directions préférées (${list}).`
      : `Vent du ${compassLabel(reading.directionDegrees)} : ne fait pas partie des directions préférées (${list}).`,
  }
}

function conditionsFor(
  wind: WindValue | Unavailable,
  hour: HourSelection,
): ConditionsValue | Unavailable {
  if (wind.status !== 'available') {
    return unavailable(`Conditions non disponibles : ${wind.reason}`)
  }
  const { reading } = wind
  return {
    status: 'available',
    temperatureCelsius: reading.temperatureCelsius,
    precipitationMm: reading.precipitationMm,
    cloudCoverPercent: reading.cloudCoverPercent,
    timeKind: hour.kind,
    timeLabel: currentLabel(hour),
    source:
      'Open-Meteo (modèle) — même requête groupée que le vent, point de grille le plus proche',
    dataTime: reading.time,
  }
}

function nearestVegetation(
  waypoint: Waypoint,
  samples: VegetationSample[],
): VegetationSample | null {
  let best: VegetationSample | null = null
  let bestDistance = Infinity
  for (const sample of samples) {
    const d = haversineMeters(waypoint.coordinate, sample.coordinate)
    if (d < bestDistance) {
      best = sample
      bestDistance = d
    }
  }
  return best
}

function habitatFor(waypoint: Waypoint, input: CompareCachesInput): HabitatValue {
  const terrain = unavailableResult('terrain', NO_TERRAIN_REASON)
  const stateReason = sourceReason(input.vegetationState, 'Végétation')
  let vegetation = unavailableResult(
    'vegetation',
    stateReason ?? 'Aucune donnée de végétation chargée.',
  )
  if (input.vegetationState.status === 'ok' && input.vegetation) {
    vegetation = vegetationAnalyzer(nearestVegetation(waypoint, input.vegetation), {
      dataTime: input.vegetationState.fetchedAt,
    })
  }
  const informed = isCovered(vegetation) || isCovered(terrain)
  return {
    state: informed ? 'informed' : 'not-informed',
    summary: informed
      ? 'Habitat renseigné : végétation OpenStreetMap (terrain non évalué depuis cette page).'
      : `Habitat non renseigné. ${vegetation.unavailableReason ?? ''}`.trim(),
    terrain,
    vegetation,
  }
}

function dataAgeFor(input: CompareCachesInput, wind: WindValue | Unavailable): DataAge {
  return {
    windFetchedAt: input.wind.status === 'ok' ? input.wind.fetchedAt : null,
    vegetationFetchedAt:
      input.vegetationState.status === 'ok' ? input.vegetationState.fetchedAt : null,
    recordsReadAt: input.records.readAt,
    modelTime: wind.status === 'available' ? wind.dataTime : null,
  }
}

// ------------------------------------------------------------------- critères

function notEvaluable(id: CriterionId, detail: string): CriterionEvaluation {
  return { id, status: 'not-evaluable', valueText: null, detail }
}

function evaluateCriteria(
  waypoint: Waypoint,
  row: Pick<
    WaypointComparison,
    'wind' | 'windPreference' | 'conditions' | 'habitat' | 'observations'
  >,
): CriterionEvaluation[] {
  const evaluations: CriterionEvaluation[] = []
  const wind = row.wind

  // 1. Direction préférée
  if (row.windPreference.directions.length === 0) {
    evaluations.push(notEvaluable('wind-direction', row.windPreference.note))
  } else if (wind.status !== 'available') {
    evaluations.push(notEvaluable('wind-direction', `Vent indisponible : ${wind.reason}`))
  } else {
    const compatible = row.windPreference.compatible === true
    evaluations.push({
      id: 'wind-direction',
      status: compatible ? 'met' : 'not-met',
      valueText: `Vent du ${compassLabel(wind.reading.directionDegrees)}`,
      detail: row.windPreference.note,
    })
  }

  // 2. Vitesse du vent
  if (wind.status !== 'available') {
    evaluations.push(notEvaluable('wind-speed', `Vent indisponible : ${wind.reason}`))
  } else {
    const speed = wind.reading.speedKmh
    const met = speed >= WIND_CALM_KMH && speed <= WIND_STRONG_KMH
    evaluations.push({
      id: 'wind-speed',
      status: met ? 'met' : 'not-met',
      valueText: `${Math.round(speed)} km/h`,
      detail: met
        ? `${Math.round(speed)} km/h : dans la plage ${WIND_CALM_KMH} à ${WIND_STRONG_KMH} km/h.`
        : speed < WIND_CALM_KMH
          ? `${Math.round(speed)} km/h : vent très calme (moins de ${WIND_CALM_KMH} km/h), les odeurs stagnent de façon imprévisible.`
          : `${Math.round(speed)} km/h : vent fort (plus de ${WIND_STRONG_KMH} km/h).`,
    })
  }

  // 3. Précipitations
  if (row.conditions.status !== 'available') {
    evaluations.push(
      notEvaluable(
        'precipitation',
        `Précipitations indisponibles : ${row.conditions.reason}`,
      ),
    )
  } else {
    const mm = row.conditions.precipitationMm
    const met = mm <= HEAVY_PRECIPITATION_MM
    evaluations.push({
      id: 'precipitation',
      status: met ? 'met' : 'not-met',
      valueText: `${mm.toFixed(1).replace('.', ',')} mm/h`,
      detail: met
        ? `${mm.toFixed(1).replace('.', ',')} mm/h : pas de fortes précipitations.`
        : `${mm.toFixed(1).replace('.', ',')} mm/h : fortes précipitations (plus de ${HEAVY_PRECIPITATION_MM} mm/h).`,
    })
  }

  // 4. Habitat (végétation)
  const vegetation = row.habitat.vegetation
  if (vegetation.score === null) {
    evaluations.push(
      notEvaluable(
        'habitat',
        vegetation.unavailableReason ??
          vegetation.noSignalReason ??
          'Habitat non renseigné.',
      ),
    )
  } else {
    const met = vegetation.score > HABITAT_NEUTRAL_INDEX
    const factors = vegetation.factors.map((f) => f.label).join(', ')
    evaluations.push({
      id: 'habitat',
      status: met ? 'met' : 'not-met',
      valueText: factors,
      detail: met
        ? `Végétation OpenStreetMap : facteurs nets positifs (${factors}).`
        : `Végétation OpenStreetMap : facteurs non positifs (${factors}).`,
    })
  }

  // 5. Signes de gibier
  const signs = row.observations.gameSigns.count
  if (signs === 0) {
    evaluations.push(
      notEvaluable(
        'game-signs',
        `Aucun signe de gibier enregistré à moins de ${row.observations.radiusMeters} m : rien à évaluer (ce n’est pas une absence de gibier).`,
      ),
    )
  } else {
    evaluations.push({
      id: 'game-signs',
      status: 'met',
      valueText: `${signs} signe(s) enregistré(s)`,
      detail: `${signs} signe(s) de gibier que vous avez enregistré(s) à moins de ${row.observations.radiusMeters} m.`,
    })
  }

  // Garde-fou : toujours 5 critères dans l'ordre déclaré.
  return CRITERION_ORDER.map((id) => {
    const found = evaluations.find((e) => e.id === id)
    return found ?? notEvaluable(id, `Critère non calculé pour « ${waypoint.name} ».`)
  })
}

function coverageOf(criteria: CriterionEvaluation[]): Coverage {
  const missing = criteria.filter((c) => c.status === 'not-evaluable').map((c) => c.id)
  const evaluable = criteria.length - missing.length
  return {
    evaluable,
    total: criteria.length,
    text: `${evaluable}/${criteria.length} critères évaluables`,
    missing,
  }
}

function missingDataFor(row: WaypointComparison): string[] {
  const missing: string[] = []
  if (row.wind.status !== 'available') missing.push(`Vent : ${row.wind.reason}`)
  if (row.conditions.status !== 'available')
    missing.push(`Conditions météo : ${row.conditions.reason}`)
  if (row.windPreference.directions.length === 0)
    missing.push('Directions de vent préférées : non enregistrées sur ce point.')
  if (row.habitat.state === 'not-informed') missing.push(row.habitat.summary)
  else missing.push(`Terrain : ${row.habitat.terrain.unavailableReason ?? 'non évalué.'}`)
  if (row.observations.gameSigns.count === 0)
    missing.push(
      `Signes de gibier : aucun enregistré à moins de ${row.observations.radiusMeters} m.`,
    )
  missing.push(`Animaux observés : ${row.observations.animalsObserved.reason}`)
  if (row.position.status === 'unavailable') missing.push(row.position.reason)
  return missing
}

// ------------------------------------------------------------------- classement

function labelOf(id: CriterionId): string {
  return criterionDefinition(id).label
}

function statusOf(row: WaypointComparison, id: CriterionId) {
  return row.criteria.find((c) => c.id === id)?.status ?? 'not-evaluable'
}

/** Exporté pour les tests : le classement à partir de lignes déjà évaluées. */
export function rankRows(rows: WaypointComparison[]): Ranking {
  const base = {
    commonCriteria: [] as CriterionId[],
    differentiating: [] as CriterionId[],
    entries: [] as RankEntry[],
    excluded: [] as { waypointId: string; reason: string }[],
  }
  if (rows.length < MIN_WAYPOINTS || rows.length > MAX_WAYPOINTS) {
    return {
      ...base,
      status: 'not-comparable',
      summary: `Choisissez de ${MIN_WAYPOINTS} à ${MAX_WAYPOINTS} points de repère pour obtenir un classement.`,
    }
  }

  const eligible: WaypointComparison[] = []
  for (const row of rows) {
    if (row.coverage.evaluable >= MIN_EVALUABLE_CRITERIA) eligible.push(row)
    else
      base.excluded.push({
        waypointId: row.waypointId,
        reason: `« ${row.name} » : ${row.coverage.text} (minimum ${MIN_EVALUABLE_CRITERIA}) — trop de données manquantes pour être classé.`,
      })
  }
  if (eligible.length < MIN_WAYPOINTS) {
    return {
      ...base,
      status: 'not-comparable',
      summary: `Ces points ne sont pas comparables : il manque trop de données (au moins ${MIN_WAYPOINTS} points doivent avoir ${MIN_EVALUABLE_CRITERIA} critères évaluables sur ${CRITERIA.length}). Aucun classement n’est établi.`,
    }
  }

  const common = CRITERION_ORDER.filter((id) =>
    eligible.every((row) => statusOf(row, id) !== 'not-evaluable'),
  )
  if (common.length < MIN_COMMON_CRITERIA) {
    return {
      ...base,
      commonCriteria: common,
      status: 'not-comparable',
      summary: `Ces points ne sont pas comparables : moins de ${MIN_COMMON_CRITERIA} critères sont évaluables pour tous (${common.length} seulement). Aucun classement n’est établi.`,
    }
  }

  const differentiating = common.filter((id) => {
    const statuses = new Set(eligible.map((row) => statusOf(row, id)))
    return statuses.size > 1
  })

  const scored = eligible.map((row, index) => {
    const met = common.filter((id) => statusOf(row, id) === 'met')
    const unmet = common.filter((id) => statusOf(row, id) === 'not-met')
    return { row, index, met, unmet }
  })
  scored.sort((a, b) => b.met.length - a.met.length || a.index - b.index)

  let rank = 0
  let previousCount = -1
  const entries: RankEntry[] = scored.map((s, position) => {
    if (s.met.length !== previousCount) {
      rank = position + 1
      previousCount = s.met.length
    }
    return {
      waypointId: s.row.waypointId,
      rank,
      metCount: s.met.length,
      commonCount: common.length,
      metCriteria: s.met,
      unmetCriteria: s.unmet,
      reasons: [],
    }
  })

  for (const entry of entries) {
    const row = eligible.find(
      (r) => r.waypointId === entry.waypointId,
    ) as WaypointComparison
    const reasons: string[] = []
    reasons.push(
      `${entry.metCount} critère(s) satisfait(s) sur ${entry.commonCount} critères communs${
        entry.metCriteria.length ? ` : ${entry.metCriteria.map(labelOf).join(' ; ')}` : ''
      }.`,
    )
    if (entry.unmetCriteria.length) {
      reasons.push(`Non satisfait : ${entry.unmetCriteria.map(labelOf).join(' ; ')}.`)
    }
    for (const id of differentiating) {
      const mine = statusOf(row, id)
      const others = eligible.filter((r) => r.waypointId !== row.waypointId)
      if (mine === 'met' && others.every((r) => statusOf(r, id) !== 'met')) {
        reasons.push(`Seul point où « ${labelOf(id)} » est satisfait.`)
      } else if (
        mine === 'not-met' &&
        others.every((r) => statusOf(r, id) !== 'not-met')
      ) {
        reasons.push(`Seul point où « ${labelOf(id)} » n’est pas satisfait.`)
      }
    }
    const tied = entries.filter(
      (e) => e.rank === entry.rank && e.waypointId !== entry.waypointId,
    )
    if (tied.length) {
      const names = tied
        .map((e) => rows.find((r) => r.waypointId === e.waypointId)?.name ?? '')
        .join(', ')
      reasons.push(`Ex æquo avec ${names} : aucun critère commun ne les départage.`)
    }
    const extra = CRITERION_ORDER.filter(
      (id) => !common.includes(id) && statusOf(row, id) !== 'not-evaluable',
    )
    if (extra.length) {
      reasons.push(
        `Critères évalués pour ce point seulement (hors tri, car manquants ailleurs) : ${extra.map(labelOf).join(' ; ')}.`,
      )
    }
    entry.reasons = reasons
  }

  const allSameRank = entries.every((e) => e.rank === 1)
  const commonText = common.map(labelOf).join(' ; ')
  if (allSameRank) {
    return {
      ...base,
      commonCriteria: common,
      differentiating,
      entries,
      status: 'tied',
      summary: `Ces points sont identiques sur les ${common.length} critères communs (${commonText}) : aucun ordre n’est établi.`,
    }
  }
  return {
    ...base,
    commonCriteria: common,
    differentiating,
    entries,
    status: 'ranked',
    summary: `Tri par nombre de critères satisfaits parmi les ${common.length} critères communs (${commonText}).${
      differentiating.length < common.length
        ? ` Ne départagent pas ces points : ${common
            .filter((id) => !differentiating.includes(id))
            .map(labelOf)
            .join(' ; ')}.`
        : ''
    }`,
  }
}

// ---------------------------------------------------------------------- export

function buildRow(
  waypoint: Waypoint,
  input: CompareCachesInput,
  hour: HourSelection,
): WaypointComparison {
  const { wind, reading } = windValueFor(waypoint, input, hour)
  const windPreference = windPreferenceFor(waypoint, reading)
  const conditions = conditionsFor(wind, hour)
  const habitat = habitatFor(waypoint, input)
  const observations = summarizeObservations(waypoint, input.records)
  const position = positionFor(input.gps, input.nowMs, waypoint.coordinate)

  const criteria = evaluateCriteria(waypoint, {
    wind,
    windPreference,
    conditions,
    habitat,
    observations,
  })
  const row: WaypointComparison = {
    waypointId: waypoint.id,
    name: waypoint.name,
    category: waypoint.category,
    coordinate: waypoint.coordinate,
    wind,
    windPreference,
    conditions,
    habitat,
    observations,
    position,
    dataAge: dataAgeFor(input, wind),
    criteria,
    coverage: coverageOf(criteria),
    missingData: [],
    advantages: criteria
      .filter((c) => c.status === 'met')
      .map((c) => `${labelOf(c.id)} — ${c.detail}`),
    drawbacks: criteria
      .filter((c) => c.status === 'not-met')
      .map((c) => `${labelOf(c.id)} — ${c.detail}`),
  }
  row.missingData = missingDataFor(row)
  return row
}

/**
 * Compare 2 à 4 points de repère pour UNE même heure. Voir les types
 * (`CacheComparison`) : c'est ce résultat structuré que l'interface affiche
 * et que l'assistant réutilisera.
 */
export function compareCaches(input: CompareCachesInput): CacheComparison {
  const hour = resolveHour(input.hourKey, input.now, input.windField?.timezone)
  const rows = input.waypoints.map((waypoint) => buildRow(waypoint, input, hour))
  return {
    hour: hourInfo(input, hour),
    criteria: [...CRITERIA],
    rows,
    ranking: rankRows(rows),
    rules: [...RANKING_RULES],
    disclaimer: DISCLAIMER,
  }
}
