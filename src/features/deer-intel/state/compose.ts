import type { Coordinate, PointForecast, SavedHuntAnalysis } from '@/types'
import {
  DEFAULT_PARAMS,
  ENGINE_VERSION,
  analyzeHunt,
  type Availability,
  type HuntObjective,
  type HuntParams,
} from '../engine'
import { isValidTimeZone, zonedDateKey } from '@/features/hunting-hours/zonedTime'
import type { HuntingRuleId } from '@/features/hunting-hours/huntingRules'
import { RULE_REGISTRY_VERSION } from '../rules/registry'
import {
  analyzeSpatial,
  createExtent,
  extentKey,
  type LandCoverData,
  type SpatialAnalysis,
} from '../spatial'

export interface HuntInputs {
  coordinate: Coordinate | null
  radiusM: number
  /** `AAAA-MM-JJ` local ; `null` = aujourd'hui au lieu choisi. */
  startDateKey: string | null
  days: number
  objective: HuntObjective
  favorableWindFrom: number[]
  sensitiveBearings: number[]
  availability: Availability | null
  huntingRuleId: HuntingRuleId | null
  experimentalSolunar: boolean
  maxCandidates: number
}

export const DEFAULT_INPUTS: HuntInputs = {
  coordinate: null,
  radiusM: 1000,
  startDateKey: null,
  days: DEFAULT_PARAMS.days,
  objective: DEFAULT_PARAMS.objective,
  favorableWindFrom: [],
  sensitiveBearings: [],
  availability: null,
  huntingRuleId: null,
  experimentalSolunar: false,
  maxCandidates: 5,
}

export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(tz) ? tz : 'UTC'
  } catch {
    return 'UTC'
  }
}

export function savedId(key: string, startDateKey: string, days: number): string {
  return `${key}|${startDateKey}|${days}`
}

/** Assemble l'analyse complète (pure) à partir des données réellement obtenues. */
export function composeAnalysis(
  inputs: HuntInputs,
  forecast: PointForecast | null,
  land: LandCoverData | null,
  meta: { now: Date; forecastFetchedAt: string | null; fallbackTimeZone: string },
): { record: SavedHuntAnalysis; timezoneNote: string | null } {
  if (!inputs.coordinate) throw new Error('Aucun point GPS choisi.')
  const extent = createExtent(inputs.coordinate, inputs.radiusM)
  const tz =
    forecast && isValidTimeZone(forecast.timezone)
      ? forecast.timezone
      : meta.fallbackTimeZone
  const timezoneNote =
    forecast && isValidTimeZone(forecast.timezone)
      ? null
      : `Fuseau de l’appareil (${tz}) utilisé : la prévision qui donne le fuseau du lieu est absente.`
  const startDateKey = inputs.startDateKey ?? zonedDateKey(meta.now, tz)
  const params: HuntParams = {
    coordinate: extent.center,
    timezone: tz,
    startDateKey,
    days: inputs.days,
    objective: inputs.objective,
    favorableWindFrom: inputs.favorableWindFrom,
    sensitiveBearings: inputs.sensitiveBearings,
    availability: inputs.availability,
    huntingRuleId: inputs.huntingRuleId,
    experimentalSolunar: inputs.experimentalSolunar,
  }
  const hunt = analyzeHunt(params, forecast, {
    now: meta.now,
    fetchedAt: meta.forecastFetchedAt,
  })
  const spatial: SpatialAnalysis | null = land
    ? analyzeSpatial(
        {
          extent,
          maxCandidates: inputs.maxCandidates,
          minSpacingM: 150,
          exclusions: [],
        },
        land,
      )
    : null
  const key = extentKey(extent)
  return {
    timezoneNote,
    record: {
      id: savedId(key, hunt.params.startDateKey, hunt.params.days),
      savedAt: meta.now.toISOString(),
      label: `${extent.center.lat.toFixed(4)}, ${extent.center.lng.toFixed(4)} · ${hunt.params.startDateKey}`,
      extentKey: key,
      startDateKey: hunt.params.startDateKey,
      days: hunt.params.days,
      timezone: tz,
      engineVersion: ENGINE_VERSION,
      registryVersion: RULE_REGISTRY_VERSION,
      hunt,
      spatial,
      data: {
        forecastFetchedAt: meta.forecastFetchedAt,
        forecastSource: forecast ? 'Open-Meteo (prévision de modèle)' : null,
        landCoverFetchedAt: land?.fetchedAt ?? null,
        landCoverSource: land?.source ?? null,
      },
    },
  }
}
