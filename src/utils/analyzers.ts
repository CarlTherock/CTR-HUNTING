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
    return unavailableResult('terrain', 'No elevation data loaded for this point yet (terrain tile not loaded).')
  }
  const { slopeDegrees, aspectDegrees } = slopeAspect
  const factors: AnalysisFactor[] = []

  if (slopeDegrees >= 5 && slopeDegrees <= 20) {
    factors.push({
      label: 'Moderate slope',
      contribution: 0.4,
      explanation: `${slopeDegrees.toFixed(0)}° slope — moderate grades like this often form natural travel edges between cover types.`,
      confidence: 'calculated',
    })
  } else if (slopeDegrees > 25) {
    factors.push({
      label: 'Steep slope',
      contribution: -0.3,
      explanation: `${slopeDegrees.toFixed(0)}° slope is quite steep — less likely to see regular travel.`,
      confidence: 'calculated',
    })
  } else {
    factors.push({
      label: 'Gentle/flat terrain',
      contribution: 0,
      explanation: `${slopeDegrees.toFixed(0)}° slope — fairly flat, no strong terrain funnel effect either way.`,
      confidence: 'calculated',
    })
  }

  factors.push({
    label: 'Aspect',
    contribution: 0,
    explanation: `Faces ${compassLabel(aspectDegrees)} — informational only (sun exposure/cover value depends on season, which isn't factored in here).`,
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
      'No OpenStreetMap land-cover data found near this point (may be sparsely mapped).',
    )
  }

  const factors: AnalysisFactor[] = []
  const categories = Object.keys(sample.categoryCounts)

  if (categories.length >= 2) {
    factors.push({
      label: 'Habitat edge',
      contribution: Math.min((categories.length - 1) * 0.2, 0.5),
      explanation: `${categories.length} distinct land-cover types mapped within ${sample.radiusMeters} m — more variety often means more edge habitat between cover types.`,
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.water || sample.categoryCounts.wetland) {
    factors.push({
      label: 'Water nearby',
      contribution: 0.3,
      explanation: 'Water/wetland mapped nearby — proximity to water is a well-established attractant.',
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.forest) {
    factors.push({
      label: 'Forest cover',
      contribution: 0.2,
      explanation: 'Forest cover mapped nearby — provides bedding/travel cover.',
      confidence: 'estimated',
    })
  }

  if (sample.categoryCounts.developed) {
    factors.push({
      label: 'Developed land nearby',
      contribution: -0.3,
      explanation: 'Residential/commercial/industrial land mapped nearby — typically reduces game activity.',
      confidence: 'estimated',
    })
  }

  if (factors.length === 0) {
    factors.push({
      label: 'Land cover mapped, no strong signal',
      contribution: 0,
      explanation: `Land cover mapped nearby (${categories.join(', ')}) but none of it maps to a strong positive/negative signal this app tracks.`,
      confidence: 'estimated',
    })
  }

  return buildResult('vegetation', factors)
}

export function weatherAnalyzer(
  current: WeatherConditions | null,
  hourly: HourlyForecastEntry[],
): AnalyzerResult {
  if (!current) return unavailableResult('weather', 'No weather data loaded yet.')

  const factors: AnalysisFactor[] = []

  const future = hourly.find((h) => h.time > current.timestamp)
  if (future) {
    const pressureDelta = future.surfacePressureHpa - current.surfacePressureHpa
    if (pressureDelta <= -1) {
      factors.push({
        label: 'Falling pressure',
        contribution: 0.3,
        explanation:
          'Pressure is forecast to fall — commonly associated with increased movement ahead of a weather change (a popular outdoor observation, not verified science).',
        confidence: 'estimated',
      })
    } else if (pressureDelta >= 1) {
      factors.push({
        label: 'Rising pressure',
        contribution: -0.1,
        explanation: 'Pressure is forecast to rise — typically calmer movement patterns.',
        confidence: 'estimated',
      })
    } else {
      factors.push({
        label: 'Stable pressure',
        contribution: 0,
        explanation: 'Pressure is holding steady over the next few hours.',
        confidence: 'estimated',
      })
    }
  }

  if (current.windSpeedKmh > 35) {
    factors.push({
      label: 'High wind',
      contribution: -0.4,
      explanation: `${Math.round(current.windSpeedKmh)} km/h wind — strong wind often suppresses daytime movement.`,
      confidence: 'measured',
    })
  } else if (current.windSpeedKmh >= 5) {
    factors.push({
      label: 'Light-moderate wind',
      contribution: 0.2,
      explanation: `${Math.round(current.windSpeedKmh)} km/h wind — comfortable conditions for movement.`,
      confidence: 'measured',
    })
  }

  if (current.precipitationMm > 4) {
    factors.push({
      label: 'Heavy precipitation',
      contribution: -0.3,
      explanation: `${current.precipitationMm.toFixed(1)} mm/h — heavy precipitation tends to reduce movement.`,
      confidence: 'measured',
    })
  } else if (current.precipitationMm > 0) {
    factors.push({
      label: 'Light precipitation',
      contribution: 0.1,
      explanation: 'Light precipitation — some hunters report it can help mask noise and scent (anecdotal).',
      confidence: 'measured',
    })
  }

  return buildResult('weather', factors)
}

export function windAnalyzer(
  reading: WindHourlyReading | null,
  optimalDirections: number[] | undefined,
): AnalyzerResult {
  if (!reading) return unavailableResult('wind', 'No wind data loaded yet.')

  const factors: AnalysisFactor[] = []

  if (optimalDirections && optimalDirections.length > 0) {
    const matches = isOptimalWind(reading.directionDegrees, optimalDirections)
    factors.push({
      label: matches ? 'Matches optimal wind' : 'Does not match optimal wind',
      contribution: matches ? 0.6 : -0.6,
      explanation: matches
        ? `Wind from ${compassLabel(reading.directionDegrees)} matches this waypoint's saved optimal directions.`
        : `Wind from ${compassLabel(reading.directionDegrees)} does not match this waypoint's saved optimal directions.`,
      confidence: 'user_observation',
    })
  }

  if (reading.speedKmh < 5) {
    factors.push({
      label: 'Very calm',
      contribution: -0.1,
      explanation: 'Very calm wind can let scent linger unpredictably rather than carrying it consistently.',
      confidence: 'measured',
    })
  } else if (reading.speedKmh <= 25) {
    factors.push({
      label: 'Steady wind',
      contribution: 0.2,
      explanation: `${Math.round(reading.speedKmh)} km/h — steady wind aids consistent scent dispersal.`,
      confidence: 'measured',
    })
  } else {
    factors.push({
      label: 'Strong wind',
      contribution: -0.3,
      explanation: `${Math.round(reading.speedKmh)} km/h — quite strong, may suppress movement.`,
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
      label: 'Dawn/dusk window',
      contribution: 0.5,
      explanation: 'Within an hour of sunrise/sunset — prime movement time for most game species (well-documented crepuscular activity pattern).',
      confidence: 'calculated',
    })
  }

  const activePeriod = data.solunarPeriods.find(
    (p) => now.getTime() >= new Date(p.start).getTime() && now.getTime() <= new Date(p.end).getTime(),
  )
  if (activePeriod) {
    factors.push({
      label: activePeriod.type === 'major' ? 'Major solunar period active' : 'Minor solunar period active',
      contribution: activePeriod.type === 'major' ? 0.4 : 0.2,
      explanation: `A ${activePeriod.type} solunar period is active now — based on Knight's Solunar Theory (1926), a popular but scientifically unverified framework.`,
      confidence: 'estimated',
    })
  }

  if (data.illumination.fraction > 0.9) {
    factors.push({
      label: 'Near-full moon',
      contribution: -0.1,
      explanation: `Moon is ${Math.round(data.illumination.fraction * 100)}% illuminated — some hunters report reduced daytime movement near a full moon (anecdotal, not verified).`,
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
      label: 'Nearby game sign',
      contribution: Math.min(nearbySignWaypoints.length * 0.2, 0.6),
      explanation: `${nearbySignWaypoints.length} waypoint(s) you've tagged as game sign/kill site/trail camera within ${HISTORY_RADIUS_METERS} m.`,
      confidence: 'user_observation',
    })
  } else {
    factors.push({
      label: 'No recorded sign nearby',
      contribution: 0,
      explanation: `No game sign/kill site/trail camera waypoints recorded within ${HISTORY_RADIUS_METERS} m yet.`,
      confidence: 'user_observation',
    })
  }

  const nearbyTracks = tracks.filter((t) =>
    t.points.some((p) => haversineMeters(coordinate, p) <= HISTORY_RADIUS_METERS),
  )
  if (nearbyTracks.length > 0) {
    factors.push({
      label: 'Past visits recorded',
      contribution: Math.min(nearbyTracks.length * 0.15, 0.4),
      explanation: `${nearbyTracks.length} recorded GPS track(s) pass within ${HISTORY_RADIUS_METERS} m of this spot.`,
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
