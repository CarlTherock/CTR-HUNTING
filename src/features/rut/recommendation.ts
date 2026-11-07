import type { DayAnalysis, HourSlot, HuntWindow } from '@/features/deer-intel/engine'
import { referenceActivity } from '@/features/deer-intel/engine/activity'
import { REFERENCE_ACTIVITY_WEIGHT } from '@/features/deer-intel/engine/windows'
import { zonedClock } from '@/features/hunting-hours/zonedTime'
import type { ObservationsSummary } from './observationsSummary'
import { METHOD_VERSION, seasonalAdvice } from './seasonalAdvice'
import type { SeasonalAdvice } from './seasonalAdvice'
import type { TerritoryState } from './territory'

/** Écart (points d'indice) en dessous duquel on n'affiche aucune différence. */
export const DISPLAY_EQUIVALENCE_POINTS = 3

export interface ClippedWindow {
  startClock: string
  endClock: string
  /** Heures réellement admissibles dans la fenêtre, après découpe aux limites. */
  minutes: number
  /** La fenêtre a été raccourcie parce qu'un bloc horaire dépassait la plage applicable. */
  clipped: boolean
  /** Indice moyen sur la durée RÉELLEMENT retenue (après découpe), pas sur le bloc entier. */
  meanIndex: number
  /**
   * Indice du meilleur noyau de 60 min dans la durée retenue (intégré tous les 5 min). Base de
   * comparaison entre créneaux : indépendante de la longueur du créneau et des bornes de bloc.
   */
  coreIndex: number
  /** Moyenne du bloc horaire entier non découpé, telle que calculée par le moteur (pour comparaison). */
  blockMeanIndex: number
  /** Facteurs de conditions évalués / non évalués sur toutes les heures de la fenêtre. */
  evaluated: string[]
  notEvaluated: string[]
  composition: 'activite_seule' | 'conditions_partielles' | 'conditions_completes'
}

const ALL_FACTORS = ['wind-direction', 'gust', 'precip'] as const

function factorState(slots: HourSlot[]): { evaluated: string[]; notEvaluated: string[] } {
  const evaluated: string[] = []
  const notEvaluated: string[] = []
  const ids = new Set<string>([
    ...ALL_FACTORS,
    ...slots.flatMap((s) => s.factors.map((f) => f.id)),
  ])
  for (const id of ids) {
    const everywhere =
      slots.length > 0 &&
      slots.every((s) => s.factors.some((f) => f.id === id && f.score !== null))
    ;(everywhere ? evaluated : notEvaluated).push(id)
  }
  return { evaluated, notEvaluated }
}

function compositionOf(
  slots: HourSlot[],
  evaluated: string[],
): ClippedWindow['composition'] {
  if (slots.every((s) => s.conditions === null) || evaluated.length === 0)
    return 'activite_seule'
  return evaluated.length >= ALL_FACTORS.length
    ? 'conditions_completes'
    : 'conditions_partielles'
}

/** Pas interne (minutes) de l'intégration de la courbe d'activité. */
const INTEGRATION_STEP_MIN = 5

/**
 * Indice moyen sur la durée retenue [start, end] : l'activité de référence est évaluée tous les
 * 5 min (au lieu d'un seul échantillon par heure, au milieu du bloc) ; les conditions restent
 * celles de l'heure météo qui contient l'instant (la météo n'est connue qu'à l'heure). Même
 * pondération 65/35 que le moteur. Sans activité (soleil sans lever/coucher) : `null`.
 */
export function integratedMean(
  day: DayAnalysis,
  slots: HourSlot[],
  start: number,
  end: number,
): number | null {
  const step = INTEGRATION_STEP_MIN * 60_000
  let sum = 0
  let n = 0
  for (let t = start; t < end; t += step) {
    const mid = Math.min(t + step / 2, end)
    const slot = slots.find(
      (s) => Date.parse(s.startIso) <= mid && mid < Date.parse(s.endIso),
    )
    if (!slot) continue
    const activity = referenceActivity(new Date(mid), day.sun)
    if (activity === null) return null
    sum +=
      slot.conditions === null
        ? activity
        : REFERENCE_ACTIVITY_WEIGHT * activity +
          (1 - REFERENCE_ACTIVITY_WEIGHT) * slot.conditions
    n++
  }
  return n === 0 ? null : sum / n
}

const CORE_MIN = 60

/** Meilleur noyau de 60 min (ou toute la durée si elle est plus courte). */
export function coreMean(
  day: DayAnalysis,
  slots: HourSlot[],
  start: number,
  end: number,
): number | null {
  const core = CORE_MIN * 60_000
  if (end - start <= core) return integratedMean(day, slots, start, end)
  let best: number | null = null
  for (let t = start; t + core <= end; t += INTEGRATION_STEP_MIN * 60_000) {
    const v = integratedMean(day, slots, t, t + core)
    if (v !== null && (best === null || v > best)) best = v
  }
  return best
}

/** Identité exacte des facteurs évalués : deux fenêtres ne se comparent que si elle est identique. */
export function factorKey(w: Pick<ClippedWindow, 'evaluated'>): string {
  return [...w.evaluated].sort().join('+') || 'aucun'
}

/**
 * Découpe une fenêtre du moteur à la plage applicable : un bloc horaire qui chevauche à peine la
 * plage ne fait pas entrer ses minutes hors plage dans la fenêtre affichée. La borne de fin
 * (p. ex. 17:00) est la fin de la dernière heure, ou la fin de la plage si elle vient avant.
 */
export function clipWindow(
  w: HuntWindow,
  day: DayAnalysis,
  timeZone: string,
): ClippedWindow | null {
  const range = day.planningRange
  const winStart = Date.parse(w.startIso)
  const winEnd = Date.parse(w.endIso)
  const start = range.start ? Math.max(winStart, range.start.getTime()) : winStart
  const end = range.end ? Math.min(winEnd, range.end.getTime()) : winEnd
  if (end <= start) return null
  const slots = day.slots.filter(
    (s) =>
      s.candidate && Date.parse(s.startIso) >= winStart && Date.parse(s.endIso) <= winEnd,
  )
  const { evaluated, notEvaluated } = factorState(slots)
  return {
    startClock: zonedClock(new Date(start), timeZone),
    endClock: zonedClock(new Date(end), timeZone),
    minutes: Math.round((end - start) / 60_000),
    clipped: start !== winStart || end !== winEnd,
    meanIndex: integratedMean(day, slots, start, end) ?? w.meanIndex,
    coreIndex: coreMean(day, slots, start, end) ?? w.meanIndex,
    blockMeanIndex: w.meanIndex,
    evaluated,
    notEvaluated,
    composition: compositionOf(slots, evaluated),
  }
}

export interface MissingInfo {
  id: string
  label: string
  consequence: string
}

export interface DayRanking {
  /** Peut-on dire qu'un créneau vaut mieux qu'un autre ? */
  state: 'departage' | 'equivalents' | 'non_comparables' | 'aucun_creneau'
  explanation: string
}

/** Le classement est limité aux éléments de même composition et refusé si l'écart est minuscule. */
export function rankWindows(windows: ClippedWindow[]): DayRanking {
  if (windows.length === 0)
    return {
      state: 'aucun_creneau',
      explanation: 'Aucun créneau n’atteint le seuil ce jour-là.',
    }
  if (windows.length === 1)
    return {
      state: 'departage',
      explanation: 'Un seul créneau est marqué : il n’y a rien à comparer.',
    }
  if (
    new Set(windows.map((w) => w.composition)).size > 1 ||
    new Set(windows.map(factorKey)).size > 1
  )
    return {
      state: 'non_comparables',
      explanation:
        'Ces créneaux reposent sur des données de composition différente (météo, vent ou poste évalués pour certains et pas pour d’autres) : ils ne sont pas comparés entre eux.',
    }
  const sorted = [...windows].sort((a, b) => b.coreIndex - a.coreIndex)
  if (sorted[0].coreIndex - sorted[1].coreIndex < DISPLAY_EQUIVALENCE_POINTS)
    return {
      state: 'equivalents',
      explanation:
        'Les deux meilleurs créneaux sont équivalents : l’écart est trop petit pour être présenté comme une différence.',
    }
  return {
    state: 'departage',
    explanation:
      'Le premier créneau l’emporte avec les paramètres choisis. Cela mesure la robustesse du classement à ces réglages, pas la validité scientifique du moteur.',
  }
}

export interface RecommendationInput {
  day: DayAnalysis
  timeZone: string | null
  territory: TerritoryState
  summary: ObservationsSummary
  hasPostInfo: boolean
}

export interface Recommendation {
  methodVersion: string
  seasonal: SeasonalAdvice
  windows: ClippedWindow[]
  ranking: DayRanking
  missing: MissingInfo[]
  observationNote: string | null
  /** Rappel : activité de référence schématique ≠ conditions pratiques ≠ observations. */
  separation: string
}

export function observationNote(summary: ObservationsSummary): string | null {
  if (summary.entries === 0) return null
  return summary.hasEffort
    ? 'Ces chiffres décrivent seulement quand vous avez noté des observations ; vos sorties enregistrées donnent une idée de votre effort, sans prouver que les cerfs sont plus actifs à une heure donnée.'
    : 'Ces chiffres décrivent seulement quand vous avez noté des observations. Sans effort de surveillance comparable, ils ne montrent pas que les cerfs sont plus actifs à une heure donnée.'
}

export function missingInfo(input: RecommendationInput): MissingInfo[] {
  const out: MissingInfo[] = []
  if (input.timeZone === null)
    out.push({
      id: 'timezone',
      label: 'Fuseau du point non établi',
      consequence: 'Aucun horaire fiable n’est affiché.',
    })
  if (input.day.weatherCoverage === 'aucune')
    out.push({
      id: 'weather',
      label: 'Météo indisponible',
      consequence:
        'L’indice ne repose que sur l’activité de référence schématique : il ne se compare pas à celui d’un jour avec météo.',
    })
  else if (input.day.weatherCoverage === 'partielle')
    out.push({
      id: 'weather-partial',
      label: 'Météo partielle',
      consequence:
        'Certaines heures n’ont pas de prévision : elles ne sont pas comparées aux autres.',
    })
  if (!input.hasPostInfo)
    out.push({
      id: 'post',
      label: 'Poste et secteurs sensibles inconnus',
      consequence:
        'Direction du vent connue, mais compatibilité avec le poste non évaluée : le vent n’est ni favorable ni défavorable pour ce poste.',
    })
  if (input.summary.entries === 0)
    out.push({
      id: 'observations',
      label: 'Aucune observation locale',
      consequence: 'Rien ne nuance le contexte saisonnier avec votre terrain.',
    })
  if (input.summary.byGroup.camera.entries === 0)
    out.push({
      id: 'camera',
      label: 'Aucun événement de caméra',
      consequence: 'Absence de données n’est pas absence de cerfs.',
    })
  return out
}

export function recommend(input: RecommendationInput): Recommendation {
  const tz = input.timeZone
  const windows =
    tz === null
      ? []
      : input.day.windows
          .map((w) => clipWindow(w, input.day, tz))
          .filter((w): w is ClippedWindow => w !== null)
  return {
    methodVersion: METHOD_VERSION,
    seasonal: seasonalAdvice(input.day.dateKey, input.territory),
    windows,
    ranking:
      tz === null
        ? {
            state: 'aucun_creneau',
            explanation: 'Horaires non établis : aucun créneau affiché.',
          }
        : rankWindows(windows),
    missing: missingInfo(input),
    observationNote: observationNote(input.summary),
    separation:
      'Trois niveaux distincts : contexte saisonnier, conditions pratiques (météo, vent, poste) et observations locales. Leur combinaison n’est pas une probabilité de voir un cerf.',
  }
}
