import type { Coordinate } from '@/types'

/**
 * Types de l'assistant « utile et traçable » (phase 14).
 *
 * Tout ce que produit ce dossier est DÉTERMINISTE : des règles et des
 * calculs écrits dans le code, appliqués à des données enregistrées sur
 * l'appareil. Rien ici n'est généré par un modèle. Chaque énoncé porte une
 * étiquette de nature, et l'étiquette « interprétation IA » est
 * réservée (par le TYPE) à une réponse d'un service distant qui n'existe
 * pas encore.
 */

/** Nature d'un énoncé, visible à l'écran à côté de chaque phrase. */
export type StatementNature =
  'fait enregistré' | 'calcul' | 'estimation' | 'interprétation IA'

/** Natures que le code déterministe a le droit d'émettre : jamais
 * « interprétation IA ». */
export type DeterministicNature = Exclude<StatementNature, 'interprétation IA'>

/** Ce qu'un lien peut ouvrir. */
export type EntityKind = 'waypoint' | 'journal' | 'track' | 'cell'

/**
 * Référence vers un élément consulté (point de repère, entrée de journal,
 * trace, cellule d'analyse). `label` et `excerpt` sont des DONNÉES de
 * l'utilisateur : déjà nettoyés et tronqués (voir `text.ts`), affichés
 * échappés, jamais interprétés.
 */
export interface EntityRef {
  kind: EntityKind
  id: string
  label: string
  /** Position de l'élément, si elle existe (ne part jamais vers un service
   * distant sans consentement « coordonnées »). */
  coordinate?: Pick<Coordinate, 'lat' | 'lng'>
  /** Début de la note, nettoyé et tronqué (ne part jamais vers un service
   * distant sans consentement « notes »). */
  excerpt?: string
  /** Identifiants des photos rattachées (jamais les images elles-mêmes). */
  photoIds?: string[]
}

export interface Statement<N extends StatementNature = DeterministicNature> {
  /** Identifiant stable dans le résultat (`s1`, `s2`…). */
  id: string
  text: string
  nature: N
  /** Éléments sur lesquels l'énoncé s'appuie (chacun est un lien). */
  refs: EntityRef[]
}

export interface AssistantSection<N extends StatementNature = DeterministicNature> {
  heading: string
  statements: Statement<N>[]
}

export type AssistantToolId =
  | 'explain'
  | 'compare-caches'
  | 'territory-summary'
  | 'history-search'
  | 'compare-periods'

/** Un facteur d'analyse consulté (pour la traçabilité, jamais un score caché). */
export interface ContextFactor {
  /** Libellé de code (« Vent », « Critère »), jamais un nom saisi par l'utilisateur. */
  group: string
  /** Identifiant opaque de l'élément auquel le facteur s'applique, s'il y en a un. */
  subjectId?: string
  label: string
  contribution: number
  weight: number
  /** `false` : affiché mais non compté dans le score. */
  counted: boolean
  nature: StatementNature
  source: string | null
}

/**
 * Contexte structuré qui accompagne TOUTE réponse : ce qui a été utilisé,
 * quand, d'où, quels facteurs, ce qui manquait, et quels éléments ont été
 * consultés. C'est aussi la seule charge utile que l'on envisage d'envoyer
 * à un service distant (après consentement), jamais les textes de notes
 * mélangés à des instructions.
 */
export interface AssistantContext {
  tool: AssistantToolId
  /** ISO : quand la réponse a été calculée. */
  generatedAt: string
  /** Données utilisées, en français (« 42 points de repère »). */
  dataUsed: string[]
  /** Dates utiles : { libellé, valeur lisible }. */
  dates: { label: string; value: string }[]
  /** Sources des données (fournisseurs, « enregistrements de l'appareil »). */
  sources: string[]
  factors: ContextFactor[]
  /** Données manquantes ou non évaluables, en français. */
  missingData: string[]
  /** Éléments consultés (plafonnés à `CONSULTED_CAP` ; voir `consultedTotal`). */
  consulted: EntityRef[]
  consultedTotal: number
}

/** « Calcul / résumé automatique » : jamais « IA générative ». */
export const DETERMINISTIC_ORIGIN_LABEL = 'Calcul / résumé automatique'

export interface AssistantResult<N extends StatementNature = DeterministicNature> {
  tool: AssistantToolId
  title: string
  /** `deterministic` : produit par le code, sans modèle. */
  origin: 'deterministic'
  originLabel: typeof DETERMINISTIC_ORIGIN_LABEL
  sections: AssistantSection<N>[]
  context: AssistantContext
}

/** Plafond d'éléments listés dans `context.consulted` (le total reste exact). */
export const CONSULTED_CAP = 200
/** Plafond de liens affichés par énoncé. */
export const REFS_PER_STATEMENT_CAP = 20
