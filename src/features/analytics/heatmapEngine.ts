import { sampleSlopeAspect } from '@/features/map/terrainQuery'
import {
  combineAnalyses,
  historyAnalyzer,
  terrainAnalyzer,
  timeAnalyzer,
  unavailableResult,
  vegetationAnalyzer,
  weatherAnalyzer,
  windAnalyzer,
} from '@/utils/analyzers'
import {
  dataTimeZone,
  resolveHour,
  weatherForHour,
  windReadingForHour,
} from '@/utils/analysisTime'
import { computeTemporalData } from '@/utils/temporal'
import { nearestSample } from '@/utils/windField'
import type { HourSelection } from '@/utils/analysisTime'
import type {
  AnalysisHeatmapCell,
  AnalyzerResult,
  Coordinate,
  Observation,
  TemporalData,
  Track,
  VegetationSample,
  WeatherForecast,
  WindField,
  Waypoint,
} from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

/**
 * Moteur de la carte de potentiel — le MÊME moteur d'analyseurs que
 * l'outil « Analyser cet endroit », découpé en deux temps pour que changer
 * d'heure ne demande aucune requête :
 *
 * 1. `computeCellStatics` — ce qui ne dépend PAS de l'heure (terrain,
 *    végétation, observations personnelles), calculé une fois par calcul
 *    de zone ;
 * 2. `analyzeCellAtHour` — ce qui en dépend (météo, vent, moment
 *    solaire/lunaire), recalculé à la volée, de façon pure, à partir du
 *    vent et de la météo DÉJÀ chargés.
 */

export interface CellStatic {
  coordinate: Coordinate
  terrain: AnalyzerResult
  vegetation: AnalyzerResult
  history: AnalyzerResult
}

export interface StaticOptions {
  /** Rectangle de la cellule : les observations sont cherchées dedans. */
  cellBounds?: LngLatBounds
  /** Plus grand côté de la cellule (m). */
  cellScopeMeters?: number
  observations?: Observation[]
  /** Quand la végétation et les enregistrements ont été lus (ISO). */
  fetchedAt?: string
}

export function computeCellStatics(
  coordinate: Coordinate,
  queryElevation: (coordinate: Coordinate) => number | null,
  vegetation: VegetationSample | null,
  waypoints: Waypoint[],
  tracks: Track[],
  options: StaticOptions = {},
): CellStatic {
  return {
    coordinate,
    terrain: terrainAnalyzer(sampleSlopeAspect(queryElevation, coordinate)),
    vegetation: vegetationAnalyzer(vegetation, { dataTime: options.fetchedAt }),
    history: historyAnalyzer(coordinate, waypoints, tracks, {
      cellBounds: options.cellBounds,
      scopeMeters: options.cellScopeMeters,
      observations: options.observations,
      dataTime: options.fetchedAt,
    }),
  }
}

export interface HourlyInputs {
  windField: WindField | null
  weather: WeatherForecast | null
}

export interface HourOptions {
  /** Espacement d'échantillonnage de la grille de vent (m). */
  sampleSpacingMeters?: number
  /** `zone-center` : la météo vient d'UNE requête au centre de la zone,
   * identique pour toutes les cellules. `point` : elle a été demandée pour
   * ce point précis. */
  weatherScope?: 'zone-center' | 'point'
  /** Directions de vent optimales d'un waypoint (analyse d'un point seulement). */
  optimalWindDirections?: number[]
  /** Données solaires/lunaires déjà calculées pour l'heure (identiques sur
   * toute la zone) — évite 64 recalculs identiques. */
  temporal?: TemporalData
}

/** Les trois analyseurs qui dépendent de l'heure, plus le vent/la météo
 * d'un même instant, pour UNE coordonnée. Pur : aucune requête. */
export function analyzeHourly(
  coordinate: Coordinate,
  hour: HourSelection,
  inputs: HourlyInputs,
  options: HourOptions = {},
): { weather: AnalyzerResult; wind: AnalyzerResult; time: AnalyzerResult } {
  const { windField, weather } = inputs
  const timeKind = hour.kind

  const sample = windField ? nearestSample(windField, coordinate) : null
  const reading = windReadingForHour(sample?.hourly, hour)
  const wind = reading
    ? windAnalyzer(reading, options.optimalWindDirections, {
        timeLabel: hour.timeLabel,
        timeKind,
        sampleSpacingMeters: options.sampleSpacingMeters,
      })
    : unavailableResult(
        'wind',
        windField
          ? `L’heure ${hour.clock} n’est pas dans les données de vent chargées (aucune extrapolation).`
          : 'Aucune donnée de vent chargée pour le moment.',
      )

  const atHour = weatherForHour(weather, hour)
  const weatherResult =
    atHour.conditions && weather
      ? weatherAnalyzer(atHour.conditions, weather.hourly, {
          // Le vent de la grille (plus local) prime : on ne compte pas deux
          // fois la même vitesse de vent.
          includeWindSpeed: reading === null,
          timeLabel: hour.timeLabel,
          timeKind,
          uniformAcrossArea: (options.weatherScope ?? 'zone-center') === 'zone-center',
        })
      : unavailableResult('weather', atHour.reason ?? 'Aucune donnée météo chargée.')

  const temporal =
    options.temporal ?? computeTemporalData(hour.solarReference, coordinate)
  const time = timeAnalyzer(temporal, hour.instant, {
    timeLabel: hour.timeLabel,
    timeKind,
  })

  return { weather: weatherResult, wind, time }
}

/** Une cellule complète à l'heure choisie. */
export function analyzeCellAtHour(
  statics: CellStatic,
  hour: HourSelection,
  inputs: HourlyInputs,
  options: HourOptions = {},
): AnalysisHeatmapCell {
  const { weather, wind, time } = analyzeHourly(statics.coordinate, hour, inputs, options)
  return {
    coordinate: statics.coordinate,
    combined: combineAnalyses([
      statics.terrain,
      statics.vegetation,
      weather,
      wind,
      time,
      statics.history,
    ]),
  }
}

/**
 * L'ancienne API d'une cellule (analyse « maintenant », ou à `hourKey` si
 * fourni), conservée pour les appelants et tests existants.
 */
export function computeHeatmapCell(
  coordinate: Coordinate,
  queryElevation: (coordinate: Coordinate) => number | null,
  windField: WindField | null,
  weather: WeatherForecast | null,
  vegetation: VegetationSample | null,
  waypoints: Waypoint[],
  tracks: Track[],
  now: Date,
  hourKey: string | null = null,
): AnalysisHeatmapCell {
  const hour = resolveHour(hourKey, now, dataTimeZone(windField, weather))
  return analyzeCellAtHour(
    computeCellStatics(coordinate, queryElevation, vegetation, waypoints, tracks),
    hour,
    { windField, weather },
  )
}
