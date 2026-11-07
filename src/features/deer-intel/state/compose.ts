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

/** Empreinte courte des réglages qui changent le résultat (poste, vent, plage, règle…). */
export function inputsSignature(inputs: HuntInputs): string {
  const raw = JSON.stringify([
    inputs.objective,
    inputs.favorableWindFrom,
    inputs.sensitiveBearings,
    inputs.availability,
    inputs.huntingRuleId,
    inputs.experimentalSolunar,
    inputs.maxCandidates,
  ])
  let h = 5381
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0
  return (h >>> 0).toString(16)
}

/**
 * Une analyse enregistrée correspond-elle à ces entrées ? Compare lieu, période et réglages
 * du moteur lus dans l'enregistrement lui-même : les analyses d'avant la clé à empreinte restent
 * donc relues hors ligne (sans confondre un autre poste, un autre vent ou une autre date).
 */
export function recordMatchesInputs(
  record: SavedHuntAnalysis,
  inputs: HuntInputs,
  key: string,
  startDateKey: string,
): boolean {
  const p = record.hunt.params
  return (
    record.extentKey === key &&
    record.startDateKey === startDateKey &&
    record.days === inputs.days &&
    p.objective === inputs.objective &&
    p.huntingRuleId === inputs.huntingRuleId &&
    p.experimentalSolunar === inputs.experimentalSolunar &&
    JSON.stringify(p.favorableWindFrom) === JSON.stringify(inputs.favorableWindFrom) &&
    JSON.stringify(p.sensitiveBearings) === JSON.stringify(inputs.sensitiveBearings) &&
    JSON.stringify(p.availability) === JSON.stringify(inputs.availability)
  )
}

/** Clé d'une analyse : lieu + période + réglages. Un autre poste ou vent = une autre analyse. */
export function savedId(
  key: string,
  startDateKey: string,
  days: number,
  signature = '',
): string {
  return `${key}|${startDateKey}|${days}|${signature}`
}

/**
 * Une analyse enregistrée avant l'ajout des réglages (poste, vent) à la clé n'a pas de
 * signature : elle reste consultable telle quelle, mais n'est jamais associée à de nouveaux
 * réglages par approximation.
 */
export function isLegacySavedId(id: string): boolean {
  return id.split('|').length < 4
}

/** Fuseau du point introuvable sans prévision : aucun horaire fiable n'est calculé. */
export class TimezoneUnresolvedError extends Error {
  constructor() {
    super(
      'Fuseau du point non établi sans prévision météo : les horaires fiables sont indisponibles. Réessayez avec une connexion.',
    )
    this.name = 'TimezoneUnresolvedError'
  }
}

/** Assemble l'analyse complète (pure) à partir des données réellement obtenues. */
export function composeAnalysis(
  inputs: HuntInputs,
  forecast: PointForecast | null,
  land: LandCoverData | null,
  /** `fallbackTimeZone` : fuseau déduit du TERRITOIRE du point (jamais celui du téléphone) ; `null` si non établi. */
  meta: { now: Date; forecastFetchedAt: string | null; fallbackTimeZone: string | null },
): { record: SavedHuntAnalysis; timezoneNote: string | null } {
  if (!inputs.coordinate) throw new Error('Aucun point GPS choisi.')
  const extent = createExtent(inputs.coordinate, inputs.radiusM)
  const forecastTz =
    forecast && isValidTimeZone(forecast.timezone) ? forecast.timezone : null
  const tz = forecastTz ?? meta.fallbackTimeZone
  if (tz === null) throw new TimezoneUnresolvedError()
  const timezoneNote = forecastTz
    ? null
    : `Fuseau déduit du territoire du point (${tz}) : la prévision qui donne le fuseau est absente.`
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
      id: savedId(
        key,
        hunt.params.startDateKey,
        hunt.params.days,
        inputsSignature(inputs),
      ),
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
