import { WINDOW_EQUIVALENCE_POINTS } from './recommendation'
import type { ClippedWindow, Recommendation } from './recommendation'

export const INDICATIVE_NOTICE =
  'Estimation indicative fondée sur les références régionales, les conditions disponibles et les règles du modèle.'

export interface RecommendationText {
  /** « Pour ce lieu et cette période, je privilégierais… » */
  headline: string
  /** Deux ou trois raisons courtes. */
  reasons: string[]
  /** Limite principale, si elle change vraiment le conseil. */
  mainLimit: string | null
  /** Autre option comparable, le cas échéant. */
  alternative: string | null
}

const span = (w: ClippedWindow) => `${w.startClock}–${w.endClock}`

/** Texte de la recommandation (pur : aucune valeur n'est ajoutée à celles du moteur). */
export function recommendationText(rec: Recommendation): RecommendationText {
  const [first, second] = [...rec.windows].sort((a, b) => b.meanIndex - a.meanIndex)
  const reasons: string[] = []
  let headline: string
  let alternative: string | null = null

  if (!first) {
    headline =
      rec.ranking.state === 'aucun_creneau' &&
      rec.missing.some((m) => m.id === 'timezone')
        ? 'Aucun horaire fiable n’est disponible pour ce point, donc aucun créneau n’est recommandé.'
        : 'Aucun créneau n’atteint le seuil ce jour-là : je ne recommande pas de créneau précis.'
  } else if (rec.ranking.state === 'non_comparables') {
    headline = `Pour ce lieu et cette période, deux créneaux ressortent (${span(first)} et ${span(second ?? first)}), sans classement possible entre eux.`
  } else if (rec.ranking.state === 'equivalents' && second) {
    headline = `Pour ce lieu et cette période, je privilégierais le matin ou le soir : ${span(first)} et ${span(second)} sont comparables.`
  } else {
    headline = `Pour ce lieu et cette période, je privilégierais ${span(first)}.`
    if (second) alternative = `Autre option, moins bien classée : ${span(second)}.`
  }

  if (rec.seasonal.covered) {
    reasons.push(rec.seasonal.effect)
    if (rec.seasonal.extendPresence.status === 'option')
      reasons.push(rec.seasonal.extendPresence.text)
  } else {
    reasons.push(rec.seasonal.effect)
  }
  if (first) {
    reasons.push(
      first.composition === 'activite_seule'
        ? 'Sans météo : créneau fondé seulement sur l’activité de référence (schématique, ancrée sur le lever et le coucher locaux).'
        : first.notEvaluated.includes('wind-direction')
          ? 'Le vent est connu, mais sa compatibilité avec le poste n’est pas évaluée : il n’est ni favorable ni défavorable pour ce poste.'
          : 'Le créneau suit le lever et le coucher locaux, avec les conditions pratiques disponibles.',
    )
  }

  const limit =
    rec.missing.find((m) => m.id === 'timezone') ??
    rec.missing.find((m) => m.id === 'weather') ??
    rec.missing.find((m) => m.id === 'post') ??
    null
  return {
    headline,
    reasons: reasons.slice(0, 3),
    mainLimit: limit ? `${limit.label} : ${limit.consequence}` : null,
    alternative,
  }
}

export interface DayRank {
  dateKey: string
  best: ClippedWindow | null
}

/** Classement des jours, limité aux jours de même composition et refusé si l'écart est minuscule. */
export function rankDays(days: DayRank[]): {
  state: 'departage' | 'equivalents' | 'non_comparables' | 'insuffisant'
  order: string[]
  explanation: string
} {
  const withBest = days.filter(
    (d): d is { dateKey: string; best: ClippedWindow } => d.best !== null,
  )
  if (withBest.length < 2)
    return {
      state: 'insuffisant',
      order: [],
      explanation: 'Moins de deux jours à comparer.',
    }
  if (new Set(withBest.map((d) => d.best.composition)).size > 1)
    return {
      state: 'non_comparables',
      order: [],
      explanation:
        'Ces jours reposent sur des données de composition différente : ils ne sont pas comparés entre eux.',
    }
  const sorted = [...withBest].sort((a, b) => b.best.meanIndex - a.best.meanIndex)
  if (sorted[0].best.meanIndex - sorted[1].best.meanIndex < WINDOW_EQUIVALENCE_POINTS)
    return {
      state: 'equivalents',
      order: sorted.map((d) => d.dateKey),
      explanation:
        'Les meilleurs jours sont comparables : rien dans les données disponibles ne les départage.',
    }
  return {
    state: 'departage',
    order: sorted.map((d) => d.dateKey),
    explanation:
      'Classement selon les conditions pratiques disponibles seulement (pas le contexte saisonnier).',
  }
}
