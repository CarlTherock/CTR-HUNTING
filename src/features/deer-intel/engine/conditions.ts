import { angularDifference, flowDegrees } from './circular'
import type { Factor, HourWeather } from './types'

export const CONDITION_RULE_IDS = [
  'CND-WIND-DIRECTION-01',
  'CND-GUST-01',
  'CND-PRECIP-01',
] as const

/** Vent très faible : la direction de modèle devient peu fiable. */
export const LOW_WIND_KMH = 5

const clamp = (v: number) => Math.min(100, Math.max(0, v))
const ramp = (x: number, lo: number, hi: number, scoreLo: number, scoreHi: number) =>
  clamp(scoreLo + ((x - lo) / (hi - lo)) * (scoreHi - scoreLo))

export interface ConditionInput {
  weather: HourWeather | null
  favorableWindFrom: number[]
  sensitiveBearings: number[]
}

/**
 * Conditions de CHASSE (confort et compatibilité du vent avec ce que la personne a renseigné) —
 * pas l'activité des cerfs. Chaque facteur absent est « non évalué » (`score: null`) et n'entre
 * pas dans la moyenne : jamais 0, jamais 50.
 */
export function evaluateConditions(input: ConditionInput): {
  factors: Factor[]
  score: number | null
  signature: string
} {
  const { weather, favorableWindFrom, sensitiveBearings } = input
  const factors: Factor[] = []

  // Direction du vent × poste / zone sensible (seulement si renseignés)
  const from = weather?.windFromDegrees ?? null
  const speed = weather?.windSpeedKmh ?? null
  const lowWind = speed !== null && speed < LOW_WIND_KMH
  if (favorableWindFrom.length === 0 && sensitiveBearings.length === 0) {
    factors.push({
      id: 'wind-direction',
      label: 'Vent et poste',
      value: from === null ? null : `${Math.round(from)}°`,
      score: null,
      note: 'Aucune direction de vent favorable ni zone sensible renseignée : non évalué (aucun « bon vent universel »).',
    })
  } else if (from === null) {
    factors.push({
      id: 'wind-direction',
      label: 'Vent et poste',
      value: null,
      score: null,
      note: 'Direction du vent indisponible pour cette heure.',
    })
  } else {
    const parts: number[] = []
    const notes: string[] = []
    if (favorableWindFrom.length > 0) {
      const d = Math.min(...favorableWindFrom.map((f) => angularDifference(from, f)))
      parts.push(d <= 22.5 ? 100 : ramp(d, 22.5, 90, 100, 0))
      notes.push(`écart de ${Math.round(d)}° avec la direction favorable la plus proche`)
    }
    if (sensitiveBearings.length > 0) {
      const flow = flowDegrees(from)
      const d = Math.min(...sensitiveBearings.map((b) => angularDifference(flow, b)))
      parts.push(d <= 45 ? (40 * d) / 45 : 100)
      notes.push(
        d <= 45
          ? `le vent porte l'odeur vers la zone sensible (écart ${Math.round(d)}°)`
          : 'le vent ne porte pas l’odeur vers la zone sensible',
      )
    }
    factors.push({
      id: 'wind-direction',
      label: 'Vent et poste',
      value: `${Math.round(from)}°`,
      score: Math.min(...parts),
      note:
        notes.join(' ; ') +
        (lowWind
          ? ` — vent très faible (${Math.round(speed ?? 0)} km/h) : direction peu fiable.`
          : '.'),
    })
  }

  const gust = weather?.windGustsKmh ?? null
  factors.push({
    id: 'gusts',
    label: 'Rafales',
    value: gust === null ? null : `${Math.round(gust)} km/h`,
    score: gust === null ? null : ramp(gust, 25, 55, 100, 20),
    note:
      gust === null
        ? 'Rafales indisponibles.'
        : 'Contrainte de confort et de bruit pour le chasseur, pas un effet sur le cerf. Une prévision horaire n’exclut ni les rafales ni les tourbillons locaux.',
  })

  const rain = weather?.precipitationMm ?? null
  factors.push({
    id: 'precipitation',
    label: 'Précipitations',
    value: rain === null ? null : `${rain.toFixed(1)} mm`,
    score: rain === null ? null : ramp(rain, 0.2, 2, 100, 30),
    note:
      rain === null
        ? 'Précipitations indisponibles.'
        : 'Confort et visibilité du chasseur ; aucun pic d’activité n’est supposé après une averse.',
  })

  const scored = factors.filter((f) => f.score !== null)
  const score =
    scored.length === 0
      ? null
      : scored.reduce((s, f) => s + (f.score ?? 0), 0) / scored.length
  return { factors, score, signature: scored.map((f) => f.id).join('+') }
}
