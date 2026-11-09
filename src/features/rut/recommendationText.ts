import { DISPLAY_EQUIVALENCE_POINTS, factorKey } from './recommendation'
import type { ClippedWindow, Recommendation } from './recommendation'

export const INDICATIVE_NOTICE =
  'Estimation indicative fondée sur les références régionales, les conditions disponibles et les règles du modèle.'

export interface RecommendationText {
  headline: string
  reasons: string[]
  mainLimit: string | null
  alternative: string | null
}

const span = (w: ClippedWindow) => `${w.startClock}–${w.endClock}`

/** Noyau de comparaison existant ; une moyenne globale ne remplace jamais cet indice. */
export function compareWindowCores(a: ClippedWindow, b: ClippedWindow): number {
  return b.coreIndex - a.coreIndex || a.startClock.localeCompare(b.startClock)
}

export function recommendationText(rec: Recommendation): RecommendationText {
  const windows = rec.windows.filter((w) => Number.isFinite(w.coreIndex) && w.coreIndex >= 0 && w.coreIndex <= 100)
  const ordered = rec.ranking.state === 'non_comparables'
    ? [...windows].sort((a, b) => a.startClock.localeCompare(b.startClock))
    : [...windows].sort(compareWindowCores)
  const [first, second] = ordered
  const reasons: string[] = []
  let headline: string
  let alternative: string | null = null
  if (!first) {
    headline = rec.missing.some((m) => m.id === 'timezone')
      ? 'Aucun horaire fiable n’est disponible pour ce point, donc aucun créneau n’est recommandé.'
      : 'Aucun créneau n’atteint le seuil ce jour-là : je ne recommande pas de créneau précis.'
  } else if (rec.ranking.state === 'non_comparables') {
    headline = `Pour ce lieu et cette période, deux créneaux ressortent (${span(first)} et ${span(second ?? first)}), sans classement possible entre eux.`
  } else if (rec.ranking.state === 'equivalents' && second) {
    headline = `Pour ce lieu et cette période, je privilégierais l’un de ces deux créneaux : ${span(first)} et ${span(second)} sont comparables.`
  } else {
    headline = `Pour ce lieu et cette période, je privilégierais ${span(first)}.`
    if (second) alternative = `Autre option, moins bien classée : ${span(second)}.`
  }
  reasons.push(rec.seasonal.effect)
  if (rec.seasonal.covered && rec.seasonal.extendPresence.status === 'option') reasons.push(rec.seasonal.extendPresence.text)
  if (first) reasons.push(
    first.composition === 'activite_seule'
      ? 'Sans météo : créneau fondé seulement sur l’activité de référence (schématique, ancrée sur le lever et le coucher locaux).'
      : first.notEvaluated.includes('wind-direction')
        ? 'Le vent est connu, mais sa compatibilité avec le poste n’est pas évaluée : il n’est ni favorable ni défavorable pour ce poste.'
        : 'Le créneau suit le lever et le coucher locaux, avec les conditions pratiques disponibles.',
  )
  const limit = rec.missing.find((m) => m.id === 'timezone') ?? rec.missing.find((m) => m.id === 'weather') ?? rec.missing.find((m) => m.id === 'post') ?? null
  return { headline, reasons: reasons.slice(0, 3), mainLimit: limit ? `${limit.label} : ${limit.consequence}` : null, alternative }
}

export interface DayRank {
  dateKey: string
  best: ClippedWindow | null
}

export function rankDays(days: DayRank[]): {
  state: 'departage' | 'equivalents' | 'non_comparables' | 'insuffisant'
  order: string[]
  explanation: string
} {
  const withBest = days.filter(
    (d): d is { dateKey: string; best: ClippedWindow } => d.best !== null && Number.isFinite(d.best.coreIndex) && d.best.coreIndex >= 0 && d.best.coreIndex <= 100,
  )
  if (withBest.length < 2) return { state: 'insuffisant', order: [], explanation: 'Moins de deux jours à comparer.' }
  if (new Set(withBest.map((d) => d.best.composition)).size > 1 || new Set(withBest.map((d) => factorKey(d.best))).size > 1) return {
    state: 'non_comparables', order: [], explanation: 'Ces jours reposent sur des données de composition différente : ils ne sont pas comparés entre eux.',
  }
  const sorted = [...withBest].sort((a, b) => b.best.coreIndex - a.best.coreIndex || a.dateKey.localeCompare(b.dateKey))
  const first = sorted[0], second = sorted[1]
  if (!first || !second) return { state: 'insuffisant', order: [], explanation: 'Moins de deux jours à comparer.' }
  if (first.best.coreIndex - second.best.coreIndex < DISPLAY_EQUIVALENCE_POINTS) return {
    state: 'equivalents', order: sorted.map((d) => d.dateKey), explanation: 'Les meilleurs jours sont comparables : rien dans les données disponibles ne les départage.',
  }
  return { state: 'departage', order: sorted.map((d) => d.dateKey), explanation: 'Classement selon les conditions pratiques disponibles seulement (pas le contexte saisonnier).' }
}
