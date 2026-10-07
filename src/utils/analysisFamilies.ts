import type {
  AnalysisCoverage,
  AnalysisFamily,
  AnalyzerId,
  AnalyzerResult,
  FamilyResult,
} from '@/types'

/** Les 6 groupes de facteurs, dans l'ordre d'affichage. */
export const ANALYZER_IDS: readonly AnalyzerId[] = [
  'terrain',
  'vegetation',
  'weather',
  'wind',
  'time',
  'history',
]

export const ANALYZER_FAMILY: Record<AnalyzerId, AnalysisFamily> = {
  terrain: 'habitat',
  vegetation: 'habitat',
  weather: 'conditions',
  wind: 'conditions',
  time: 'conditions',
  history: 'observations',
}

export const FAMILY_ORDER: readonly AnalysisFamily[] = [
  'habitat',
  'conditions',
  'observations',
]

export const FAMILY_LABEL: Record<AnalysisFamily, string> = {
  habitat: 'Habitat',
  conditions: 'Conditions',
  observations: 'Observations',
}

export const FAMILY_HINT: Record<AnalysisFamily, string> = {
  habitat: 'Terrain et végétation — relativement stables dans le temps.',
  conditions:
    'Vent et météo à l’heure choisie, plus le moment solaire/lunaire (indice populaire non vérifié).',
  observations:
    'Vos propres enregistrements (indices de gibier). Les visites sont une information, pas un bonus.',
}

/** Noms courts des groupes. « Historique » = le groupe de la famille
 * Observations (nom conservé pour la continuité de l'interface). */
export const ANALYZER_LABEL: Record<AnalyzerId, string> = {
  terrain: 'Terrain',
  vegetation: 'Végétation',
  weather: 'Météo',
  wind: 'Vent',
  time: 'Moment',
  history: 'Historique',
}

/**
 * Un groupe est « renseigné » quand sa donnée d'entrée existait : il a un
 * score, ou bien il a été évalué sans qu'aucune règle ne se déclenche
 * (`covered`). Un groupe dont la donnée manque (fournisseur en échec,
 * tuile non chargée, aucun enregistrement personnel ici) n'est PAS
 * renseigné — et ne pèse jamais dans le score (ni 0, ni 50 inventé).
 */
export function isCovered(result: AnalyzerResult): boolean {
  return result.score !== null || result.covered === true
}

export function computeCoverage(results: AnalyzerResult[]): AnalysisCoverage {
  const missing = results.filter((r) => !isCovered(r)).map((r) => r.analyzer)
  return { available: results.length - missing.length, total: results.length, missing }
}

/**
 * Cellule « partiellement renseignée » pour le rendu : il manque une
 * donnée ENVIRONNEMENTALE (terrain, végétation, météo, vent). Les
 * observations personnelles absentes sont l'état normal d'un secteur
 * jamais visité : elles ne hachurent pas la carte (la vue « Observations »
 * les montre comme « sans données »), mais restent comptées dans le texte
 * de couverture de la fiche.
 */
export function isPartiallyInformed(coverage: AnalysisCoverage): boolean {
  return coverage.missing.some((id) => ANALYZER_FAMILY[id] !== 'observations')
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
}

export function summarizeFamilies(results: AnalyzerResult[]): FamilyResult[] {
  return FAMILY_ORDER.map((family) => {
    const members = results.filter((r) => ANALYZER_FAMILY[r.analyzer] === family)
    return {
      family,
      score: mean(members.filter((r) => r.score !== null).map((r) => r.score as number)),
      analyzers: members.map((r) => r.analyzer),
      coverage: computeCoverage(members),
    }
  })
}
