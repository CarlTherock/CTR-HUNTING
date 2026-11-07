import type { Coordinate, PointForecast } from '@/types'
import type { HuntingRuleId } from '@/features/hunting-hours/huntingRules'

/** À incrémenter à chaque changement de calcul. */
export const ENGINE_VERSION = '1.0.0'

export type HuntObjective = 'prospection' | 'observation' | 'poste'

export interface Availability {
  /** Minutes depuis minuit local (0–1440). */
  startMinutes: number
  endMinutes: number
}

export interface HuntParams {
  coordinate: Coordinate
  /** Fuseau IANA du lieu. */
  timezone: string
  /** Premier jour, `AAAA-MM-JJ` local. */
  startDateKey: string
  /** Nombre de jours (1–7). */
  days: number
  objective: HuntObjective
  /** Directions d'ORIGINE du vent (°) favorables au poste. Vide = inconnu. */
  favorableWindFrom: number[]
  /** Caps (°, depuis le poste) vers une zone sensible. Vide = non renseignée. */
  sensitiveBearings: number[]
  availability: Availability | null
  huntingRuleId: HuntingRuleId | null
  /** Hypothèse solunaire expérimentale (désactivée par défaut). */
  experimentalSolunar: boolean
}

export const DEFAULT_PARAMS: Omit<
  HuntParams,
  'coordinate' | 'timezone' | 'startDateKey'
> = {
  days: 3,
  objective: 'poste',
  favorableWindFrom: [],
  sensitiveBearings: [],
  availability: null,
  huntingRuleId: null,
  experimentalSolunar: false,
}

export interface SunInfo {
  sunrise: Date | null
  sunset: Date | null
  dawn: Date | null
  dusk: Date | null
  dayLengthMinutes: number | null
}

export type MoonVisibility = 'normal' | 'always_up' | 'always_down'

export interface MoonInfo {
  /** Fraction éclairée à midi local (0–1) — pas la luminosité disponible. */
  illuminationFraction: number
  phaseName: string
  waxing: boolean
  rise: Date | null
  set: Date | null
  /** Passage au méridien (lune « au-dessus »). `null` si absent ce jour-là. */
  upperTransit: Date | null
  /** Passage inférieur (lune « sous les pieds »). `null` si absent ce jour-là. */
  lowerTransit: Date | null
  visibility: MoonVisibility
}

export interface Factor {
  id: string
  label: string
  /** Valeur lue (affichage). */
  value: string | null
  /** 0–100 ; `null` = non évalué (jamais remplacé par 0 ou 50). */
  score: number | null
  note: string
}

export interface HourWeather {
  temperatureC: number | null
  /** Variation depuis la veille à la même heure ; `null` si la veille n'est pas dans les données. */
  temperatureChangeSinceYesterdayC: number | null
  /** Pression de SURFACE (hPa), pas ramenée au niveau de la mer. */
  surfacePressureHpa: number | null
  /** Variation sur 3 h (hPa) ; `null` si une des deux valeurs manque. */
  pressureChange3hHpa: number | null
  precipitationMm: number | null
  windSpeedKmh: number | null
  windGustsKmh: number | null
  windFromDegrees: number | null
  cloudCoverPercent: number | null
  snowDepthM: number | null
  snowfallCm: number | null
}

export interface HourSlot {
  startIso: string
  endIso: string
  dateKey: string
  /** `HH:mm` local. */
  clock: string
  /** Clé de prévision locale `AAAA-MM-JJTHH:00`. */
  localKey: string
  /** Soleil au-dessus de l'horizon au milieu de l'heure. */
  sunUp: boolean | null
  moonUp: boolean
  /** Activité biologique de référence (0–100), `null` sans lever/coucher. */
  activity: number | null
  /** Avec l'hypothèse solunaire (comparaison). */
  activityWithHypothesis: number | null
  conditions: number | null
  factors: Factor[]
  /** Indice de créneau (0–100) selon les réglages ; `null` si indisponible. */
  index: number | null
  /** Facteurs réellement utilisés : sert à signaler des heures non comparables. */
  signature: string
  /** Heure admissible comme créneau de chasse (plage + disponibilité). */
  candidate: boolean
  weather: HourWeather | null
}

export interface HuntWindow {
  startIso: string
  endIso: string
  startClock: string
  endClock: string
  meanIndex: number
  maxIndex: number
  hours: number
  /** Les heures du créneau reposent sur les mêmes facteurs. */
  comparable: boolean
}

export type Robustness =
  'stable' | 'fragile' | 'equivalent' | 'unique' | 'none' | 'insufficient'

export interface DayAnalysis {
  dateKey: string
  sun: SunInfo
  moon: MoonInfo
  /** Plage utilisée pour les créneaux et son origine. */
  planningRange: {
    start: Date | null
    end: Date | null
    origin: 'regle' | 'planification' | 'indisponible'
    label: string
  }
  slots: HourSlot[]
  windows: HuntWindow[]
  robustness: Robustness
  robustnessNote: string
  weatherCoverage: 'complete' | 'partielle' | 'aucune'
}

export interface VariantResult {
  id: 'reference' | 'avec_hypothese_solunaire' | 'activite_seule'
  label: string
  topWindow: HuntWindow | null
  explanation: string
}

export interface HuntAnalysis {
  engineVersion: string
  registryVersion: string
  generatedAt: string
  params: HuntParams
  /** Origine de la météo : `null` = aucune prévision (activité de référence seulement). */
  forecast: {
    fetchedAt: string | null
    validFrom: string | null
    validTo: string | null
  } | null
  days: DayAnalysis[]
  /** Premier jour : comparaison des variantes (référence / hypothèse / activité seule). */
  variants: VariantResult[]
  limits: string[]
}

export type { PointForecast }
