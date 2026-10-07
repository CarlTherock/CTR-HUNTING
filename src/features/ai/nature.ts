import type { DataConfidence } from '@/types'
import type { DeterministicNature, StatementNature } from './types'

/**
 * Passage du vocabulaire de qualité des données (`DataConfidence`, utilisé
 * par les analyseurs) à l'étiquette affichée à côté de chaque énoncé.
 * `ai_interpretation` ne peut venir que d'un service distant : il n'a pas
 * d'équivalent dans le code déterministe (voir `deterministicNatureOf`).
 */
export function natureOfConfidence(confidence: DataConfidence): StatementNature {
  switch (confidence) {
    case 'measured':
    case 'user_observation':
      return 'fait enregistré'
    case 'calculated':
      return 'calcul'
    case 'estimated':
      return 'estimation'
    case 'ai_interpretation':
      return 'interprétation IA'
  }
}

/** Variante pour le code déterministe : une donnée « interprétation IA »
 * ne devrait jamais y arriver ; si c'est le cas, on la rétrograde en
 * « estimation » plutôt que d'afficher une étiquette IA pour du calcul. */
export function deterministicNatureOf(
  confidence: DataConfidence | 'unavailable',
): DeterministicNature {
  if (confidence === 'unavailable') return 'calcul'
  const nature = natureOfConfidence(confidence)
  return nature === 'interprétation IA' ? 'estimation' : nature
}

export const NATURE_ORDER: readonly StatementNature[] = [
  'fait enregistré',
  'calcul',
  'estimation',
  'interprétation IA',
]

/** Explication courte de chaque étiquette (légende affichée à l'écran). */
export const NATURE_HELP: Record<StatementNature, string> = {
  'fait enregistré':
    'Donnée enregistrée sur l’appareil (vos points, traces, entrées) ou rapportée telle quelle par une source.',
  calcul:
    'Résultat d’une règle ou d’un calcul écrit dans l’application, appliqué aux données ci-dessus. Un énoncé qui mêle un fait et un calcul porte l’étiquette « calcul ».',
  estimation:
    'Valeur modélisée (prévision, indice, agrégation) : plausible, non mesurée à cet endroit.',
  'interprétation IA':
    'Texte produit par un modèle d’IA distant. Aucune réponse de ce type n’existe dans cette version.',
}
