import { haversineMeters } from './geo'
import { isOptimalWind } from './windField'
import { compassLabel } from './terrain'
import { ANALYZER_FAMILY, computeCoverage, summarizeFamilies } from './analysisFamilies'
import type { SlopeAspect } from './terrain'
import type {
  AnalysisFactor,
  AnalyzerResult,
  CombinedAnalysis,
  Coordinate,
  DataConfidence,
  FactorTimeKind,
  HourlyForecastEntry,
  Observation,
  TemporalData,
  Track,
  VegetationSample,
  WeatherConditions,
  WindHourlyReading,
  Waypoint,
} from '@/types'

/**
 * Six independent, explainable analyzers (Phase 8), regroupés en trois
 * familles (Habitat / Conditions / Observations — voir
 * `analysisFamilies.ts`). Every one is a pure function over data the app
 * already has for real (Phases 4-7) or the user's own local records — none
 * of them fetch anything themselves, and none produce a bare score without
 * the real factors behind it (a hard project rule). Several factors are
 * framed around commonly cited outdoor observations (barometric pressure,
 * crepuscular activity, solunar theory) that are popular among hunters but
 * not settled science — those are labeled as such in their own explanation
 * text and flagged `unverified`.
 *
 * Règles de score (visibles dans l'interface) :
 * - chaque facteur compté pèse 1 (moyenne simple) ; un facteur
 *   `scored: false` est une information affichée, jamais comptée ;
 * - un analyseur SANS facteur compté n'a pas de score (`null`), au lieu
 *   d'un 50 « neutre » qui pesait dans la moyenne combinée ;
 * - le score est un indice de repère comparatif, JAMAIS une probabilité.
 */

const CONFIDENCE_RANK: Record<DataConfidence, number> = {
  measured: 4,
  calculated: 3,
  estimated: 2,
  user_observation: 2,
  ai_interpretation: 1,
}

/** The least-certain confidence among a set — an analyzer's overall
 * confidence is only ever as strong as its weakest contributing factor. */
function weakestConfidence(confidences: DataConfidence[]): DataConfidence {
  return confidences.reduce((weakest, c) =>
    CONFIDENCE_RANK[c] < CONFIDENCE_RANK[weakest] ? c : weakest,
  )
}

/** Moyenne pondérée des facteurs COMPTÉS (poids 1 par défaut), ramenée sur
 * 0-100 autour de 50. Un facteur « informatif » (`scored: false`) est
 * affiché mais n'entre jamais ici. Sans aucun facteur compté, il n'y a PAS
 * de score (`null`) : l'ancien repli à 50 faisait peser un « neutre caché »
 * dans la moyenne combinée. */
function scoreFromFactors(factors: AnalysisFactor[]): number | null {
  const counted = factors.filter((f) => f.scored !== false)
  if (counted.length === 0) return null
  const totalWeight = counted.reduce((sum, f) => sum + (f.weight ?? 1), 0)
  const total = counted.reduce((sum, f) => sum + f.contribution * (f.weight ?? 1), 0)
  return Math.max(0, Math.min(100, 50 + (total / totalWeight) * 50))
}

/** Métadonnées communes à tous les facteurs d'un analyseur ; les champs
 * propres à un facteur l'emportent. */
interface FactorMeta {
  source: string
  timeKind: FactorTimeKind
  timeLabel?: string
  dataTime?: string
  resolutionMeters?: number | null
  uniformAcrossArea?: boolean
  unverified?: boolean
  limits?: string
}

function buildResult(
  analyzer: AnalyzerResult['analyzer'],
  factors: AnalysisFactor[],
  meta: FactorMeta,
  noSignalReason: string,
): AnalyzerResult {
  const family = ANALYZER_FAMILY[analyzer]
  const tagged = factors.map((f) => ({ ...meta, family, weight: 1, ...f }))
  const counted = tagged.filter((f) => f.scored !== false)
  const score = scoreFromFactors(tagged)
  return {
    analyzer,
    family,
    score,
    confidence:
      counted.length > 0
        ? weakestConfidence(counted.map((f) => f.confidence))
        : 'unavailable',
    factors: tagged,
    covered: true,
    ...(score === null ? { noSignalReason } : {}),
  }
}

export function unavailableResult(
  analyzer: AnalyzerResult['analyzer'],
  reason: string,
): AnalyzerResult {
  return {
    analyzer,
    family: ANALYZER_FAMILY[analyzer],
    score: null,
    confidence: 'unavailable',
    factors: [],
    covered: false,
    unavailableReason: reason,
  }
}

const TERRAIN_META: FactorMeta = {
  source: 'Tuiles d’élévation Terrarium (AWS)',
  timeKind: 'static',
  limits:
    'Calculé sur la tuile d’élévation chargée à l’écran (résolution variable selon le zoom). Ne voit ni le couvert, ni les sentiers, ni les ouvrages.',
}

export function terrainAnalyzer(slopeAspect: SlopeAspect | null): AnalyzerResult {
  if (!slopeAspect) {
    return unavailableResult(
      'terrain',
      'Aucune donnée d’élévation chargée pour ce point (tuile de terrain non chargée).',
    )
  }
  const { slopeDegrees, aspectDegrees } = slopeAspect
  const factors: AnalysisFactor[] = []

  if (slopeDegrees >= 5 && slopeDegrees <= 20) {
    factors.push({
      label: 'Pente modérée',
      contribution: 0.4,
      explanation: `Pente de ${slopeDegrees.toFixed(0)}° — des pentes modérées comme celle-ci forment souvent des lisières naturelles de déplacement entre les types de couvert.`,
      confidence: 'calculated',
    })
  } else if (slopeDegrees > 25) {
    factors.push({
      label: 'Pente abrupte',
      contribution: -0.3,
      explanation: `Une pente de ${slopeDegrees.toFixed(0)}° est assez abrupte — les déplacements réguliers y sont moins probables.`,
      confidence: 'calculated',
    })
  } else if (slopeDegrees > 20) {
    factors.push({
      label: 'Pente soutenue',
      contribution: 0,
      explanation: `Pente de ${slopeDegrees.toFixed(0)}° — soutenue sans être abrupte : ni avantage ni désavantage retenu par l’application.`,
      confidence: 'calculated',
    })
  } else {
    factors.push({
      label: 'Terrain doux ou plat',
      contribution: 0,
      explanation: `Pente de ${slopeDegrees.toFixed(0)}° — plutôt plat, sans effet d’entonnoir marqué dans un sens ou dans l’autre.`,
      confidence: 'calculated',
    })
  }

  // Information seulement : l'exposition n'a aucune règle de score. Comptée
  // à 0, elle diluait la pente (moyenne de 2 facteurs au lieu de 1).
  factors.push({
    label: 'Exposition',
    contribution: 0,
    scored: false,
    explanation: `Orientée vers le ${compassLabel(aspectDegrees)} — à titre indicatif seulement (l’ensoleillement et la valeur du couvert dépendent de la saison, qui n’est pas prise en compte ici).`,
    confidence: 'calculated',
  })

  return buildResult(
    'terrain',
    factors,
    TERRAIN_META,
    'Aucune règle de terrain applicable.',
  )
}

/** Verified live before building (see the Phase 8 research): ESA
 * WorldCover has no point-query API (rasters only), and USGS NLCD is
 * US-only — neither fits this app's primary Quebec/Canada usage. Real
 * OpenStreetMap `landuse`/`natural` tags (via `services/vegetation/`)
 * are the viable, globally-available option, with the honest caveat
 * that coverage depends on how densely that area has been mapped —
 * sparse in remote wilderness, which is exactly why this reports
 * `unavailable` rather than guessing when nothing real comes back. */
export function vegetationAnalyzer(
  sample: VegetationSample | null,
  options: { dataTime?: string } = {},
): AnalyzerResult {
  if (!sample || Object.keys(sample.categoryCounts).length === 0) {
    return unavailableResult(
      'vegetation',
      'Aucune donnée d’occupation du sol d’OpenStreetMap trouvée près de ce point (la zone est peut-être peu cartographiée : « non cartographié » ne veut pas dire « sans végétation »).',
    )
  }

  const meta: FactorMeta = {
    source: 'OpenStreetMap (Overpass)',
    timeKind: 'static',
    dataTime: options.dataTime,
    resolutionMeters: sample.radiusMeters * 2,
    limits:
      'Couverture variable selon la densité de cartographie. Chaque polygone est compté dans la cellule la plus proche de son centre : un grand polygone n’apparaît donc que dans une cellule. Ni essences, ni âge, ni densité du peuplement.',
  }
  const factors: AnalysisFactor[] = []
  const categories = Object.keys(sample.categoryCounts)

  if (categories.length >= 2) {
    factors.push({
      label: 'Lisière d’habitat',
      contribution: Math.min((categories.length - 1) * 0.2, 0.5),
      explanation: `${categories.length} types distincts d’occupation du sol cartographiés dans un rayon de ${sample.radiusMeters} m — plus de variété signifie souvent plus de lisières d’habitat entre les types de couvert.`,
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.water || sample.categoryCounts.wetland) {
    factors.push({
      label: 'Eau à proximité',
      contribution: 0.3,
      explanation:
        'Eau ou milieu humide cartographié à proximité — la proximité de l’eau est un attrait bien établi.',
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.forest) {
    factors.push({
      label: 'Couvert forestier',
      contribution: 0.2,
      explanation:
        'Couvert forestier cartographié à proximité — il offre un abri de repos et de déplacement.',
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.developed) {
    factors.push({
      label: 'Terrain aménagé à proximité',
      contribution: -0.3,
      explanation:
        'Terrains résidentiels, commerciaux ou industriels cartographiés à proximité — ils réduisent généralement l’activité du gibier.',
      confidence: 'estimated',
    })
  }

  if (factors.length === 0) {
    // Information seulement : de l'occupation du sol cartographiée sans
    // règle applicable n'est pas un signal « neutre » à compter.
    factors.push({
      label: 'Occupation du sol cartographiée, sans signal marqué',
      contribution: 0,
      scored: false,
      explanation: `Occupation du sol cartographiée à proximité (${categories.join(', ')}), mais aucune ne correspond à un signal positif ou négatif marqué parmi ceux que suit l’application.`,
      confidence: 'estimated',
    })
  }

  return buildResult(
    'vegetation',
    factors,
    meta,
    'Occupation du sol cartographiée, mais aucune règle de végétation applicable.',
  )
}

export interface WeatherAnalyzerOptions {
  /** Compter la vitesse du vent de la météo (défaut `true`). À mettre à
   * `false` quand une lecture de vent de la grille existe pour la même
   * heure : sinon la même grandeur serait comptée deux fois. */
  includeWindSpeed?: boolean
  /** « actuel », « prévision pour 18:00 »… */
  timeLabel?: string
  timeKind?: FactorTimeKind
  /** Même valeur pour toute la zone (météo demandée au centre). */
  uniformAcrossArea?: boolean
}

/** `current` = les conditions de l'heure analysée (relevé actuel ou entrée
 * horaire de l'heure choisie) ; `hourly` sert uniquement à lire la
 * tendance de pression sur l'heure SUIVANTE. */
export function weatherAnalyzer(
  current: WeatherConditions | null,
  hourly: HourlyForecastEntry[],
  options: WeatherAnalyzerOptions = {},
): AnalyzerResult {
  if (!current)
    return unavailableResult('weather', 'Aucune donnée météo chargée pour le moment.')

  const includeWind = options.includeWindSpeed ?? true
  const uniform = options.uniformAcrossArea ?? false
  const meta: FactorMeta = {
    source: 'Open-Meteo (modèle)',
    timeKind: options.timeKind ?? 'current',
    timeLabel: options.timeLabel ?? 'actuel',
    dataTime: current.timestamp,
    resolutionMeters: uniform ? null : undefined,
    uniformAcrossArea: uniform,
    limits: uniform
      ? 'Une seule requête météo, au centre de la zone : la même valeur pour toutes les cellules. Elle ne montre AUCUNE variation locale.'
      : 'Valeur du modèle pour ce point précis ; peut différer de ce qui est observé sur le terrain.',
  }
  const factors: AnalysisFactor[] = []

  const future = hourly.find((h) => h.time > current.timestamp)
  if (future) {
    const pressureDelta = future.surfacePressureHpa - current.surfacePressureHpa
    if (pressureDelta <= -1) {
      factors.push({
        label: 'Pression en baisse',
        contribution: 0.3,
        explanation:
          'La pression baisse sur l’heure suivante (modèle) — on l’associe couramment à plus de déplacements avant un changement de température (observation populaire en plein air, et non une science vérifiée).',
        confidence: 'estimated',
        unverified: true,
      })
    } else if (pressureDelta >= 1) {
      factors.push({
        label: 'Pression en hausse',
        contribution: -0.1,
        explanation:
          'La pression monte sur l’heure suivante (modèle) — les déplacements sont généralement plus calmes (observation populaire, non vérifiée).',
        confidence: 'estimated',
        unverified: true,
      })
    } else {
      factors.push({
        label: 'Pression stable',
        contribution: 0,
        explanation: 'La pression reste stable sur l’heure suivante (modèle).',
        confidence: 'estimated',
      })
    }
  }

  if (includeWind) {
    if (current.windSpeedKmh > 35) {
      factors.push({
        label: 'Vent fort',
        contribution: -0.4,
        explanation: `Vent de ${Math.round(current.windSpeedKmh)} km/h — un vent fort réduit souvent les déplacements de jour.`,
        confidence: 'measured',
      })
    } else if (current.windSpeedKmh >= 5) {
      factors.push({
        label: 'Vent faible à modéré',
        contribution: 0.2,
        explanation: `Vent de ${Math.round(current.windSpeedKmh)} km/h — conditions confortables pour les déplacements.`,
        confidence: 'measured',
      })
    }
  }

  if (current.precipitationMm > 4) {
    factors.push({
      label: 'Fortes précipitations',
      contribution: -0.3,
      explanation: `${current.precipitationMm.toFixed(1)} mm/h — de fortes précipitations tendent à réduire les déplacements.`,
      confidence: 'measured',
    })
  } else if (current.precipitationMm > 0) {
    factors.push({
      label: 'Faibles précipitations',
      contribution: 0.1,
      explanation:
        'Faibles précipitations — certains chasseurs rapportent qu’elles aident à masquer les bruits et les odeurs (témoignages anecdotiques).',
      confidence: 'measured',
      unverified: true,
    })
  }

  return buildResult(
    'weather',
    factors,
    meta,
    'Données météo présentes, mais aucune condition ne déclenche une règle (calme, sec, pression stable).',
  )
}

export interface WindAnalyzerOptions {
  timeLabel?: string
  timeKind?: FactorTimeKind
  /** Espacement d'échantillonnage de la grille de vent (m). */
  sampleSpacingMeters?: number
}

export function windAnalyzer(
  reading: WindHourlyReading | null,
  optimalDirections: number[] | undefined,
  options: WindAnalyzerOptions = {},
): AnalyzerResult {
  if (!reading)
    return unavailableResult('wind', 'Aucune donnée de vent chargée pour le moment.')

  const meta: FactorMeta = {
    source: 'Open-Meteo (modèle), point de grille le plus proche',
    timeKind: options.timeKind ?? 'current',
    timeLabel: options.timeLabel ?? 'actuel',
    dataTime: reading.time,
    resolutionMeters: options.sampleSpacingMeters,
    limits:
      'Vent à 10 m du point de grille échantillonné le plus proche (aucune interpolation). La maille native du modèle peut être plus grossière que la cellule ; le relief et le couvert locaux ne sont pas modélisés.',
  }
  const factors: AnalysisFactor[] = []

  if (optimalDirections && optimalDirections.length > 0) {
    const matches = isOptimalWind(reading.directionDegrees, optimalDirections)
    factors.push({
      label: matches ? 'Correspond au vent optimal' : 'Ne correspond pas au vent optimal',
      contribution: matches ? 0.6 : -0.6,
      explanation: matches
        ? `Le vent du ${compassLabel(reading.directionDegrees)} correspond aux directions optimales enregistrées pour ce point de repère.`
        : `Le vent du ${compassLabel(reading.directionDegrees)} ne correspond pas aux directions optimales enregistrées pour ce point de repère.`,
      confidence: 'user_observation',
    })
  }

  if (reading.speedKmh < 5) {
    factors.push({
      label: 'Très calme',
      contribution: -0.1,
      explanation:
        'Un vent très calme laisse les odeurs stagner de façon imprévisible au lieu de les porter de manière constante.',
      confidence: 'measured',
    })
  } else if (reading.speedKmh <= 25) {
    factors.push({
      label: 'Vent soutenu',
      contribution: 0.2,
      explanation: `${Math.round(reading.speedKmh)} km/h — un vent soutenu favorise une dispersion constante des odeurs.`,
      confidence: 'measured',
    })
  } else {
    factors.push({
      label: 'Vent fort',
      contribution: -0.3,
      explanation: `${Math.round(reading.speedKmh)} km/h — assez fort, il peut réduire les déplacements.`,
      confidence: 'measured',
    })
  }

  return buildResult('wind', factors, meta, 'Aucune règle de vent applicable.')
}

export interface TimeAnalyzerOptions {
  timeLabel?: string
  timeKind?: FactorTimeKind
}

export function timeAnalyzer(
  data: TemporalData,
  now: Date,
  options: TimeAnalyzerOptions = {},
): AnalyzerResult {
  const factors: AnalysisFactor[] = []
  const CREPUSCULAR_WINDOW_MS = 60 * 60_000
  const meta: FactorMeta = {
    source: 'Calcul astronomique local (soleil, lune)',
    timeKind: options.timeKind ?? 'current',
    timeLabel: options.timeLabel ?? 'actuel',
    dataTime: now.toISOString(),
    resolutionMeters: null,
    uniformAcrossArea: true,
    unverified: true,
    limits:
      'Indice populaire non vérifié scientifiquement. Les heures solaires/lunaires sont calculées, mais leur lien avec le déplacement du gibier ne l’est pas. Identique sur toute la zone.',
  }

  const nearSunrise =
    data.sun.sunrise &&
    Math.abs(now.getTime() - new Date(data.sun.sunrise).getTime()) <=
      CREPUSCULAR_WINDOW_MS
  const nearSunset =
    data.sun.sunset &&
    Math.abs(now.getTime() - new Date(data.sun.sunset).getTime()) <= CREPUSCULAR_WINDOW_MS
  if (nearSunrise || nearSunset) {
    factors.push({
      label: 'Fenêtre de l’aube et du crépuscule',
      contribution: 0.5,
      explanation:
        'À moins d’une heure du lever ou du coucher du soleil — période de déplacement privilégiée de la plupart des espèces de gibier (rythme d’activité crépusculaire bien documenté).',
      confidence: 'calculated',
    })
  }

  const activePeriod = data.solunarPeriods.find(
    (p) =>
      now.getTime() >= new Date(p.start).getTime() &&
      now.getTime() <= new Date(p.end).getTime(),
  )
  if (activePeriod) {
    factors.push({
      label:
        activePeriod.type === 'major'
          ? 'Période solunaire majeure en cours'
          : 'Période solunaire mineure en cours',
      contribution: activePeriod.type === 'major' ? 0.4 : 0.2,
      explanation: `Une période solunaire ${activePeriod.type === 'major' ? 'majeure' : 'mineure'} est en cours — selon la théorie solunaire de Knight (1926), un cadre populaire mais non vérifié scientifiquement.`,
      confidence: 'estimated',
    })
  }

  if (data.illumination.fraction > 0.9) {
    factors.push({
      label: 'Lune presque pleine',
      contribution: -0.1,
      explanation: `La lune est illuminée à ${Math.round(data.illumination.fraction * 100)} % — certains chasseurs rapportent moins de déplacements de jour près de la pleine lune (anecdotique, non vérifié).`,
      confidence: 'estimated',
    })
  }

  return buildResult(
    'time',
    factors,
    meta,
    'Aucun indice populaire actif à ce moment (ni aube/crépuscule, ni période solunaire, ni lune presque pleine).',
  )
}

export const HISTORY_RADIUS_METERS = 400
export const SIGN_CATEGORIES = new Set(['game_sign', 'kill_site', 'trail_camera'])

export interface HistoryAnalyzerOptions {
  /** Rayon de recherche (m). Défaut 400 ; la carte de potentiel le porte à
   * la demi-largeur d'une cellule quand elle est plus grande. */
  radiusMeters?: number
  /** Carte de potentiel : on cherche DANS la cellule (rectangle), pas dans
   * un rayon autour de son centre ; `radiusMeters` est alors ignoré. */
  cellBounds?: { north: number; south: number; east: number; west: number }
  /** Taille de la zone cherchée (m) quand `cellBounds` est fourni. */
  scopeMeters?: number
  /** Entrées du journal (texte libre) : comptées à titre d'information. */
  observations?: Observation[]
  /** Quand les enregistrements ont été lus. */
  dataTime?: string
}

/**
 * Famille Observations : ce que l'utilisateur a réellement enregistré.
 * - Les indices de gibier (catégories `game_sign`, `kill_site`,
 *   `trail_camera`) sont le SEUL facteur compté.
 * - Les visites (traces GPS), les autres waypoints et les entrées du
 *   journal sont des INFORMATIONS (`scored: false`) : un secteur très
 *   fréquenté produit plus d'enregistrements (biais d'effort
 *   d'observation), pas plus de gibier ni un meilleur habitat.
 * - Aucune donnée structurée « animal observé » n'existe dans
 *   l'application (une entrée de journal n'a que du texte libre) : rien
 *   n'est donc déduit des notes.
 */
export function historyAnalyzer(
  coordinate: Coordinate,
  waypoints: Waypoint[],
  tracks: Track[],
  options: HistoryAnalyzerOptions = {},
): AnalyzerResult {
  const radius = options.radiusMeters ?? HISTORY_RADIUS_METERS
  const cell = options.cellBounds
  const within = (c: Coordinate): boolean =>
    cell
      ? c.lat >= cell.south &&
        c.lat <= cell.north &&
        c.lng >= cell.west &&
        c.lng <= cell.east
      : haversineMeters(coordinate, c) <= radius
  const where = cell ? 'dans cette cellule' : `dans un rayon de ${Math.round(radius)} m`
  const meta: FactorMeta = {
    source: 'Vos enregistrements locaux (points de repère, traces, journal)',
    timeKind: 'record',
    dataTime: options.dataTime,
    resolutionMeters: cell ? options.scopeMeters : radius * 2,
    limits:
      'Dépend uniquement de ce que vous avez saisi : l’absence d’enregistrement n’indique pas l’absence de gibier. Les secteurs les plus visités sont les mieux documentés (biais d’effort d’observation).',
  }
  const factors: AnalysisFactor[] = []

  const nearbyWaypoints = waypoints.filter((w) => within(w.coordinate))
  const signs = nearbyWaypoints.filter((w) => SIGN_CATEGORIES.has(w.category))
  if (signs.length > 0) {
    factors.push({
      label: 'Indices de gibier à proximité',
      contribution: Math.min(signs.length * 0.2, 0.6),
      explanation: `${signs.length} point(s) de repère que vous avez classés comme indice de gibier, site d’abattage ou caméra de sentier ${where}.`,
      confidence: 'user_observation',
    })
  } else {
    factors.push({
      label: 'Aucun indice enregistré à proximité',
      contribution: 0,
      scored: false,
      explanation: `Aucun point de repère d’indice de gibier, de site d’abattage ou de caméra de sentier enregistré ${where}. Cela n’indique pas une absence de gibier : seulement que rien n’a été saisi ici.`,
      confidence: 'user_observation',
    })
  }

  const otherWaypoints = nearbyWaypoints.length - signs.length
  if (otherWaypoints > 0) {
    factors.push({
      label: 'Autres points de repère enregistrés',
      contribution: 0,
      scored: false,
      explanation: `${otherWaypoints} point(s) de repère d’une autre catégorie (poste, eau, stationnement…) ${where} — information seulement, non comptée dans le score.`,
      confidence: 'user_observation',
    })
  }

  const nearbyTracks = tracks.filter((t) => t.points.some(within))
  if (nearbyTracks.length > 0) {
    factors.push({
      label: 'Visites passées (traces GPS)',
      contribution: 0,
      scored: false,
      explanation: `${nearbyTracks.length} trace(s) GPS passent ${cell ? 'par cette cellule' : `à moins de ${Math.round(radius)} m`}. Information seulement : un secteur très visité produit plus d’enregistrements (biais d’effort d’observation), pas nécessairement plus de gibier — aucun effet sur le score.`,
      confidence: 'calculated',
    })
  }

  const journal = (options.observations ?? []).filter((o) => within(o.coordinate))
  if (journal.length > 0) {
    factors.push({
      label: 'Entrées de journal',
      contribution: 0,
      scored: false,
      explanation: `${journal.length} entrée(s) de journal ${where}. Ce sont des notes en texte libre : l’application n’en tire aucune espèce ni aucun nombre d’animaux, et ne les compte pas dans le score.`,
      confidence: 'user_observation',
    })
  }

  const result = buildResult(
    'history',
    factors,
    meta,
    'Aucun indice de gibier enregistré dans ce secteur : rien à évaluer (ce n’est pas un score bas).',
  )
  // « Renseigné » = au moins un indice de gibier enregistré ; des visites
  // seules documentent l'effort, pas le secteur.
  return { ...result, covered: signs.length > 0 }
}

export function combineAnalyses(results: AnalyzerResult[]): CombinedAnalysis {
  const withScores = results.filter(
    (r): r is AnalyzerResult & { score: number } => r.score !== null,
  )
  const families = summarizeFamilies(results)
  const coverage = computeCoverage(results)
  if (withScores.length === 0) return { overallScore: null, results, families, coverage }
  const overallScore = withScores.reduce((sum, r) => sum + r.score, 0) / withScores.length
  return { overallScore, results, families, coverage }
}
