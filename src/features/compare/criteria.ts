import type { CriterionDefinition, CriterionId } from './types'

/**
 * Les critères du comparateur et leurs seuils. Chaque règle est reprise
 * des analyseurs existants (`src/utils/analyzers.ts`) — le comparateur ne
 * crée pas un second moteur ; un test vérifie que ces seuils restent
 * alignés sur ceux des analyseurs.
 */

/** Sous ce vent (km/h), l'analyseur de vent dit « très calme ». */
export const WIND_CALM_KMH = 5
/** Au-dessus de ce vent (km/h), l'analyseur de vent dit « vent fort ». */
export const WIND_STRONG_KMH = 25
/** Au-dessus de ce cumul (mm/h), l'analyseur météo dit « fortes précipitations ». */
export const HEAVY_PRECIPITATION_MM = 4
/** Indice neutre de l'analyseur de végétation : au-dessus = net positif. */
export const HABITAT_NEUTRAL_INDEX = 50

/** Un point doit avoir au moins ce nombre de critères évaluables pour être classé. */
export const MIN_EVALUABLE_CRITERIA = 3
/** Il faut au moins ce nombre de critères évaluables POUR TOUS les points classés. */
export const MIN_COMMON_CRITERIA = 2
/** Au-delà de cette imprécision (m), la position GPS n'est pas utilisée. */
export const MAX_GPS_ACCURACY_METERS = 100

export const MIN_WAYPOINTS = 2
export const MAX_WAYPOINTS = 4

export const DISCLAIMER =
  'Comparaison indicative : ce n’est pas une prévision de réussite.'

export const CRITERIA: readonly CriterionDefinition[] = [
  {
    id: 'wind-direction',
    label: 'Vent dans une direction préférée',
    family: 'conditions',
    rule: 'Satisfait si le vent de l’heure choisie souffle d’une des directions préférées enregistrées sur le point ; non satisfait sinon.',
    requires:
      'Une direction préférée enregistrée sur le point ET une lecture de vent à cette heure.',
  },
  {
    id: 'wind-speed',
    label: `Vent soutenu (${WIND_CALM_KMH} à ${WIND_STRONG_KMH} km/h)`,
    family: 'conditions',
    rule: `Satisfait si la vitesse du vent est de ${WIND_CALM_KMH} à ${WIND_STRONG_KMH} km/h (règle « vent soutenu » de l’analyseur de vent) ; non satisfait si plus calme ou plus fort.`,
    requires: 'Une lecture de vent à l’heure choisie.',
  },
  {
    id: 'precipitation',
    label: `Pas de fortes précipitations (≤ ${HEAVY_PRECIPITATION_MM} mm/h)`,
    family: 'conditions',
    rule: `Satisfait si les précipitations de l’heure choisie sont de ${HEAVY_PRECIPITATION_MM} mm/h ou moins (seuil « fortes précipitations » de l’analyseur météo) ; non satisfait au-delà.`,
    requires: 'Une valeur de précipitations du modèle à l’heure choisie.',
  },
  {
    id: 'habitat',
    label: 'Habitat favorable (végétation)',
    family: 'habitat',
    rule: `Satisfait si les facteurs de végétation cartographiés (OpenStreetMap) sont nets positifs (indice de l’analyseur de végétation supérieur à ${HABITAT_NEUTRAL_INDEX}) ; non satisfait sinon. Le terrain n’est pas évalué depuis cette page.`,
    requires: 'De l’occupation du sol cartographiée près du point.',
  },
  {
    id: 'game-signs',
    label: 'Signe de gibier enregistré à proximité',
    family: 'observations',
    rule: 'Satisfait si au moins un point de repère « indice de gibier », « site de récolte » ou « caméra de sentier » est enregistré à proximité. Aucun signe enregistré = non évaluable (on n’a rien saisi ici, ce qui ne prouve pas l’absence de gibier).',
    requires: 'Au moins un signe de gibier enregistré à proximité.',
  },
]

export const CRITERION_ORDER: readonly CriterionId[] = CRITERIA.map((c) => c.id)

export function criterionDefinition(id: CriterionId): CriterionDefinition {
  const found = CRITERIA.find((c) => c.id === id)
  if (!found) throw new Error(`Critère inconnu : ${id}`)
  return found
}

/** Règles de tri, affichées telles quelles à l’utilisateur. */
export const RANKING_RULES: readonly string[] = [
  'Chaque critère est « satisfait », « non satisfait » ou « non évaluable » (donnée manquante) — jamais remplacé par une valeur neutre.',
  `Un point est classé seulement s’il a au moins ${MIN_EVALUABLE_CRITERIA} critères évaluables sur ${CRITERIA.length}.`,
  `Le tri compare uniquement les critères évaluables pour TOUS les points classés (au moins ${MIN_COMMON_CRITERIA}) : un point n’est ni avantagé ni pénalisé par un critère que les autres n’ont pas.`,
  'Ordre : nombre de critères satisfaits parmi ces critères communs. Même nombre = ex æquo (aucun départage caché).',
  'Un critère identique pour tous les points est signalé comme ne les départageant pas.',
  'Les critères non évaluables de chaque point sont listés ; la couverture (« 4/5 critères évaluables ») est affichée pour chacun.',
  'La distance depuis votre position, les visites, les entrées de journal et la rafale sont affichées à titre d’information : ils n’entrent pas dans le tri.',
]
