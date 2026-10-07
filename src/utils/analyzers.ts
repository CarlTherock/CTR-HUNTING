import { haversineMeters } from './geo'
import { isOptimalWind } from './windField'
import { compassLabel } from './terrain'
import type { SlopeAspect } from './terrain'
import type {
  AnalysisFactor,
  AnalyzerResult,
  CombinedAnalysis,
  Coordinate,
  DataConfidence,
  HourlyForecastEntry,
  TemporalData,
  Track,
  VegetationSample,
  WeatherConditions,
  WindHourlyReading,
  Waypoint,
} from '@/types'

/**
 * Six independent, explainable analyzers (Phase 8). Every one is a pure
 * function over data the app already has for real (Phases 4-7) or the
 * user's own local records (waypoints/tracks) — none of them fetch
 * anything themselves, and none produce a bare score without the real
 * factors behind it (a hard project rule). Several factors are framed
 * around commonly cited outdoor observations (barometric pressure,
 * crepuscular activity, solunar theory) that are popular among hunters
 * but not settled science — those are labeled as such in their own
 * explanation text, never presented as certain, matching the phase's
 * "no result presented as certainty when data is probabilistic" rule.
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

/** Baseline 50 (neutral), shifted by each factor's contribution (-1..1)
 * scaled to ±50 points, then clamped to a valid 0-100 score. */
function scoreFromFactors(factors: AnalysisFactor[]): number {
  const total = factors.reduce((sum, f) => sum + f.contribution, 0)
  const average = factors.length > 0 ? total / factors.length : 0
  return Math.max(0, Math.min(100, 50 + average * 50))
}

function buildResult(analyzer: AnalyzerResult['analyzer'], factors: AnalysisFactor[]): AnalyzerResult {
  return {
    analyzer,
    score: scoreFromFactors(factors),
    confidence: factors.length > 0 ? weakestConfidence(factors.map((f) => f.confidence)) : 'unavailable',
    factors,
  }
}

export function unavailableResult(analyzer: AnalyzerResult['analyzer'], reason: string): AnalyzerResult {
  return { analyzer, score: null, confidence: 'unavailable', factors: [], unavailableReason: reason }
}

export function terrainAnalyzer(slopeAspect: SlopeAspect | null): AnalyzerResult {
  if (!slopeAspect) {
    return unavailableResult('terrain', 'Aucune donnée d’élévation chargée pour ce point (tuile de terrain non chargée).')
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
  } else {
    factors.push({
      label: 'Terrain doux ou plat',
      contribution: 0,
      explanation: `Pente de ${slopeDegrees.toFixed(0)}° — plutôt plat, sans effet d’entonnoir marqué dans un sens ou dans l’autre.`,
      confidence: 'calculated',
    })
  }

  factors.push({
    label: 'Exposition',
    contribution: 0,
    explanation: `Orientée vers le ${compassLabel(aspectDegrees)} — à titre indicatif seulement (l’ensoleillement et la valeur du couvert dépendent de la saison, qui n’est pas prise en compte ici).`,
    confidence: 'calculated',
  })

  return buildResult('terrain', factors)
}

/** Verified live before building (see the Phase 8 research): ESA
 * WorldCover has no point-query API (rasters only), and USGS NLCD is
 * US-only — neither fits this app's primary Quebec/Canada usage. Real
 * OpenStreetMap `landuse`/`natural` tags (via `services/vegetation/`)
 * are the viable, globally-available option, with the honest caveat
 * that coverage depends on how densely that area has been mapped —
 * sparse in remote wilderness, which is exactly why this reports
 * `unavailable` rather than guessing when nothing real comes back. */
export function vegetationAnalyzer(sample: VegetationSample | null): AnalyzerResult {
  if (!sample || Object.keys(sample.categoryCounts).length === 0) {
    return unavailableResult(
      'vegetation',
      'Aucune donnée d’occupation du sol d’OpenStreetMap trouvée près de ce point (la zone est peut-être peu cartographiée).',
    )
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
      explanation: 'Eau ou milieu humide cartographié à proximité — la proximité de l’eau est un attrait bien établi.',
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.forest) {
    factors.push({
      label: 'Couvert forestier',
      contribution: 0.2,
      explanation: 'Couvert forestier cartographié à proximité — il offre un abri de repos et de déplacement.',
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.developed) {
    factors.push({
      label: 'Terrain aménagé à proximité',
      contribution: -0.3,
      explanation: 'Terrains résidentiels, commerciaux ou industriels cartographiés à proximité — ils réduisent généralement l’activité du gibier.',
      confidence: 'estimated',
    })
  }

  if (factors.length === 0) {
    factors.push({
      label: 'Occupation du sol cartographiée, sans signal marqué',
      contribution: 0,
      explanation: `Occupation du sol cartographiée à proximité (${categories.join(', ')}), mais aucune ne correspond à un signal positif ou négatif marqué parmi ceux que suit l’application.`,
      confidence: 'estimated',
    })
  }

  return buildResult('vegetation', factors)
}

export function weatherAnalyzer(
  current: WeatherConditions | null,
  hourly: HourlyForecastEntry[],
): AnalyzerResult {
  if (!current) return unavailableResult('weather', 'Aucune donnée météo chargée pour le moment.')

  const factors: AnalysisFactor[] = []

  const future = hourly.find((h) => h.time > current.timestamp)
  if (future) {
    const pressureDelta = future.surfacePressureHpa - current.surfacePressureHpa
    if (pressureDelta <= -1) {
      factors.push({
        label: 'Pression en baisse',
        contribution: 0.3,
        explanation:
          'La pression devrait baisser — on l’associe couramment à plus de déplacements avant un changement de température (observation populaire en plein air, et non une science vérifiée).',
        confidence: 'estimated',
      })
    } else if (pressureDelta >= 1) {
      factors.push({
        label: 'Pression en hausse',
        contribution: -0.1,
        explanation: 'La pression devrait monter — les déplacements sont généralement plus calmes.',
        confidence: 'estimated',
      })
    } else {
      factors.push({
        label: 'Pression stable',
        contribution: 0,
        explanation: 'La pression reste stable au cours des prochaines heures.',
        confidence: 'estimated',
      })
    }
  }

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
      explanation: 'Faibles précipitations — certains chasseurs rapportent qu’elles aident à masquer les bruits et les odeurs (témoignages anecdotiques).',
      confidence: 'measured',
    })
  }

  return buildResult('weather', factors)
}

export function windAnalyzer(
  reading: WindHourlyReading | null,
  optimalDirections: number[] | undefined,
): AnalyzerResult {
  if (!reading) return unavailableResult('wind', 'Aucune donnée de vent chargée pour le moment.')

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
      explanation: 'Un vent très calme laisse les odeurs stagner de façon imprévisible au lieu de les porter de manière constante.',
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

  return buildResult('wind', factors)
}

export function timeAnalyzer(data: TemporalData, now: Date): AnalyzerResult {
  const factors: AnalysisFactor[] = []
  const CREPUSCULAR_WINDOW_MS = 60 * 60_000

  const nearSunrise = data.sun.sunrise && Math.abs(now.getTime() - new Date(data.sun.sunrise).getTime()) <= CREPUSCULAR_WINDOW_MS
  const nearSunset = data.sun.sunset && Math.abs(now.getTime() - new Date(data.sun.sunset).getTime()) <= CREPUSCULAR_WINDOW_MS
  if (nearSunrise || nearSunset) {
    factors.push({
      label: 'Fenêtre de l’aube et du crépuscule',
      contribution: 0.5,
      explanation: 'À moins d’une heure du lever ou du coucher du soleil — période de déplacement privilégiée de la plupart des espèces de gibier (rythme d’activité crépusculaire bien documenté).',
      confidence: 'calculated',
    })
  }

  const activePeriod = data.solunarPeriods.find(
    (p) => now.getTime() >= new Date(p.start).getTime() && now.getTime() <= new Date(p.end).getTime(),
  )
  if (activePeriod) {
    factors.push({
      label: activePeriod.type === 'major' ? 'Période solunaire majeure en cours' : 'Période solunaire mineure en cours',
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

  return buildResult('time', factors)
}

const HISTORY_RADIUS_METERS = 400
const SIGN_CATEGORIES = new Set(['game_sign', 'kill_site', 'trail_camera'])

export function historyAnalyzer(
  coordinate: Coordinate,
  waypoints: Waypoint[],
  tracks: Track[],
): AnalyzerResult {
  const factors: AnalysisFactor[] = []

  const nearbySignWaypoints = waypoints.filter(
    (w) => SIGN_CATEGORIES.has(w.category) && haversineMeters(coordinate, w.coordinate) <= HISTORY_RADIUS_METERS,
  )
  if (nearbySignWaypoints.length > 0) {
    factors.push({
      label: 'Indices de gibier à proximité',
      contribution: Math.min(nearbySignWaypoints.length * 0.2, 0.6),
      explanation: `${nearbySignWaypoints.length} point(s) de repère que vous avez classés comme indice de gibier, site d’abattage ou caméra de sentier dans un rayon de ${HISTORY_RADIUS_METERS} m.`,
      confidence: 'user_observation',
    })
  } else {
    factors.push({
      label: 'Aucun indice enregistré à proximité',
      contribution: 0,
      explanation: `Aucun point de repère d’indice de gibier, de site d’abattage ou de caméra de sentier enregistré dans un rayon de ${HISTORY_RADIUS_METERS} m pour le moment.`,
      confidence: 'user_observation',
    })
  }

  const nearbyTracks = tracks.filter((t) =>
    t.points.some((p) => haversineMeters(coordinate, p) <= HISTORY_RADIUS_METERS),
  )
  if (nearbyTracks.length > 0) {
    factors.push({
      label: 'Visites passées enregistrées',
      contribution: Math.min(nearbyTracks.length * 0.15, 0.4),
      explanation: `${nearbyTracks.length} trace(s) GPS enregistrée(s) passent à moins de ${HISTORY_RADIUS_METERS} m de cet endroit.`,
      confidence: 'calculated',
    })
  }

  return buildResult('history', factors)
}

export function combineAnalyses(results: AnalyzerResult[]): CombinedAnalysis {
  const withScores = results.filter((r): r is AnalyzerResult & { score: number } => r.score !== null)
  if (withScores.length === 0) return { overallScore: null, results }
  const overallScore = withScores.reduce((sum, r) => sum + r.score, 0) / withScores.length
  return { overallScore, results }
}
