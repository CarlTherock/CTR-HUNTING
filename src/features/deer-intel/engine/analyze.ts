import type { PointForecast } from '@/types'
import { RULE_REGISTRY_VERSION } from '../rules/registry'
import {
  computeHuntingWindow,
  computeSunDay,
} from '@/features/hunting-hours/huntingWindow'
import {
  addDays,
  utcFromZoned,
  zonedClock,
  zonedDateKey,
} from '@/features/hunting-hours/zonedTime'
import { referenceActivity } from './activity'
import { evaluateConditions } from './conditions'
import { moonDay, moonIsUp } from './moon'
import { solarDay } from './sunDay'
import { solunarDelta } from './solunar'
import { hourWeather, indexForecast } from './weatherContext'
import {
  ENGINE_VERSION,
  type DayAnalysis,
  type HourSlot,
  type HuntAnalysis,
  type HuntParams,
  type VariantResult,
} from './types'
import {
  REFERENCE_ACTIVITY_WEIGHT,
  WINDOW_THRESHOLD,
  assessRobustness,
  buildWindows,
  slotIndex,
} from './windows'

const clamp100 = (v: number) => Math.min(100, Math.max(0, v))
export const MAX_DAYS = 7
/** Marge (min) avant le lever / après le coucher de la plage de planification SANS règle choisie. */
const PLANNING_MARGIN_MIN = 30

export const LIMITS: string[] = [
  'L’indice de créneau est une heuristique comparative (0–100) : ni un pourcentage de présence du cerf, ni une probabilité de récolte, ni un modèle biologique validé.',
  'Les courbes d’activité reprennent une forme qualitative publiée (activité crépusculaire, Michigan et Oklahoma) ; leurs hauteurs de pics sont des choix de conception non calibrés.',
  'Aucune validation locale (Québec) n’a été faite : les tests du code vérifient l’implémentation, pas la précision biologique.',
  'La météo est une prévision de modèle (Open-Meteo) ; le vent à 10 m n’est pas une mesure sous couvert. Au-delà de l’horizon fourni, les heures restent sans météo.',
  'Une plage horaire calculée ne vaut pas autorisation de chasser : espèce, saison, zone, permis, propriété et restrictions se vérifient séparément.',
]

function dayBounds(dateKey: string, timezone: string): { start: number; end: number } {
  return {
    start: utcFromZoned(dateKey, 0, 0, timezone).getTime(),
    end: utcFromZoned(addDays(dateKey, 1), 0, 0, timezone).getTime(),
  }
}

function buildDay(
  params: HuntParams,
  dateKey: string,
  weatherIndex: ReturnType<typeof indexForecast>,
): DayAnalysis {
  const { coordinate, timezone } = params
  const sun = solarDay(coordinate, dateKey, timezone)
  const moon = moonDay(coordinate, dateKey, timezone)

  // Plage de planification : la règle si elle est choisie et applicable, sinon la plage par défaut.
  const sunDay = computeSunDay({ coordinate, dateKey, timezone })
  const rule = computeHuntingWindow(sunDay, coordinate, params.huntingRuleId)
  let planning: DayAnalysis['planningRange']
  if (rule.state === 'computed' && rule.start && rule.end) {
    planning = {
      start: rule.start,
      end: rule.end,
      origin: 'regle',
      label: `${rule.rule?.title ?? 'Règle'} (plage calculée, pas une autorisation)`,
    }
  } else if (params.huntingRuleId) {
    planning = {
      start: null,
      end: null,
      origin: 'indisponible',
      label: rule.reason ?? 'Plage indisponible.',
    }
  } else if (sun.sunrise && sun.sunset) {
    planning = {
      start: new Date(sun.sunrise.getTime() - PLANNING_MARGIN_MIN * 60_000),
      end: new Date(sun.sunset.getTime() + PLANNING_MARGIN_MIN * 60_000),
      origin: 'planification',
      label:
        'Plage de planification (30 min avant le lever → 30 min après le coucher), non réglementaire',
    }
  } else {
    planning = {
      start: null,
      end: null,
      origin: 'indisponible',
      label: 'Le soleil ne se lève ou ne se couche pas : aucune plage calculée.',
    }
  }

  const { start, end } = dayBounds(dateKey, timezone)
  const slots: HourSlot[] = []
  for (let t = start; t < end; t += 3_600_000) {
    const slotStart = new Date(t)
    const slotEnd = new Date(Math.min(t + 3_600_000, end))
    const mid = new Date(t + 1_800_000)
    const clock = zonedClock(slotStart, timezone)
    const localKey = `${zonedDateKey(slotStart, timezone)}T${clock.slice(0, 2)}:00`
    const activity = referenceActivity(mid, sun)
    const delta = solunarDelta(mid, moon)
    const activityWithHypothesis = activity === null ? null : clamp100(activity + delta)
    const weather = hourWeather(weatherIndex, localKey)
    const cond = evaluateConditions({
      weather,
      favorableWindFrom: params.favorableWindFrom,
      sensitiveBearings: params.sensitiveBearings,
    })
    const [hh, mm] = clock.split(':').map(Number)
    const startMin = hh * 60 + mm
    const inRange =
      planning.start !== null &&
      planning.end !== null &&
      slotStart < planning.end &&
      slotEnd > planning.start
    const inAvailability =
      params.availability === null ||
      (startMin >= params.availability.startMinutes &&
        startMin + 60 <= params.availability.endMinutes)
    const slot: HourSlot = {
      startIso: slotStart.toISOString(),
      endIso: slotEnd.toISOString(),
      dateKey,
      clock,
      localKey,
      sunUp: sun.sunrise && sun.sunset ? mid >= sun.sunrise && mid <= sun.sunset : null,
      moonUp: moonIsUp(mid, coordinate),
      activity,
      activityWithHypothesis,
      conditions: cond.score,
      factors: cond.factors,
      index: null,
      signature: cond.score === null ? 'activite' : `activite+${cond.signature}`,
      candidate: inRange && inAvailability,
      weather,
    }
    slot.index = slotIndex(slot, REFERENCE_ACTIVITY_WEIGHT, params.experimentalSolunar)
    slots.push(slot)
  }

  const withHyp = params.experimentalSolunar
  const windows = buildWindows(
    slots,
    (s) => slotIndex(s, REFERENCE_ACTIVITY_WEIGHT, withHyp),
    WINDOW_THRESHOLD,
  ).slice(0, 3)
  const { robustness, note } = assessRobustness(slots)
  const candidates = slots.filter((s) => s.candidate)
  const withWeather = candidates.filter((s) => s.weather !== null).length
  return {
    dateKey,
    sun,
    moon,
    planningRange: planning,
    slots,
    windows,
    robustness,
    robustnessNote: note,
    weatherCoverage:
      candidates.length === 0 || withWeather === 0
        ? 'aucune'
        : withWeather === candidates.length
          ? 'complete'
          : 'partielle',
  }
}

function variants(day: DayAnalysis | undefined): VariantResult[] {
  if (!day) return []
  const top = (idx: (s: HourSlot) => number | null) =>
    buildWindows(day.slots, idx, WINDOW_THRESHOLD)[0] ?? null
  const ref = top((s) => slotIndex(s, REFERENCE_ACTIVITY_WEIGHT, false))
  const hyp = top((s) => slotIndex(s, REFERENCE_ACTIVITY_WEIGHT, true))
  const act = top((s) => slotIndex(s, 1, false))
  const describe = (w: typeof ref) =>
    w ? `${w.startClock}–${w.endClock}` : 'aucun créneau'
  return [
    {
      id: 'reference',
      label: 'Référence',
      topWindow: ref,
      explanation: `Activité de référence + conditions : ${describe(ref)}.`,
    },
    {
      id: 'avec_hypothese_solunaire',
      label: 'Avec hypothèse solunaire (expérimental)',
      topWindow: hyp,
      explanation:
        describe(ref) === describe(hyp)
          ? 'L’hypothèse solunaire ne change pas le meilleur créneau.'
          : `L’hypothèse déplace le meilleur créneau : ${describe(ref)} → ${describe(hyp)}.`,
    },
    {
      id: 'activite_seule',
      label: 'Activité de référence seule (sans conditions)',
      topWindow: act,
      explanation:
        describe(ref) === describe(act)
          ? 'Sans les conditions de chasse, le meilleur créneau est le même.'
          : `Sans les conditions de chasse : ${describe(act)} (référence : ${describe(ref)}).`,
    },
  ]
}

/**
 * Point d'entrée du moteur « Où et quand chasser » — partie QUAND. Pur et déterministe : mêmes
 * entrées, mêmes sorties. La météo est facultative (`forecast: null` → activité de référence
 * seulement, dite telle quelle).
 */
export function analyzeHunt(
  params: HuntParams,
  forecast: PointForecast | null,
  meta: { now: Date; fetchedAt?: string | null },
): HuntAnalysis {
  const days = Math.max(1, Math.min(MAX_DAYS, Math.floor(params.days)))
  const weatherIndex = indexForecast(forecast)
  const built: DayAnalysis[] = []
  for (let d = 0; d < days; d++) {
    built.push(buildDay(params, addDays(params.startDateKey, d), weatherIndex))
  }
  const times = forecast?.hourly.map((h) => h.time) ?? []
  return {
    engineVersion: ENGINE_VERSION,
    registryVersion: RULE_REGISTRY_VERSION,
    generatedAt: meta.now.toISOString(),
    params: { ...params, days },
    forecast: forecast
      ? {
          fetchedAt: meta.fetchedAt ?? null,
          validFrom: times[0] ?? null,
          validTo: times[times.length - 1] ?? null,
        }
      : null,
    days: built,
    variants: variants(built[0]),
    limits: LIMITS,
  }
}
