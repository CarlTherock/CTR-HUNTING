/**
 * Registre versionné des règles du module « Où et quand chasser ».
 * Chaque règle EXÉCUTÉE par le moteur y figure; chaque règle du registre dont le
 * statut est « active » ou « expérimentale » doit être exécutée par le moteur
 * (vérifié par un test). Rien ici n'est un coefficient publié inventé.
 */

/** A: résultat scientifique applicable; B: résultat d'un autre contexte;
 * C: recommandation de praticien identifiée; D: hypothèse/heuristique non calibrée. */
export type KnowledgeCategory = 'A' | 'B' | 'C' | 'D'

export type RuleStatus = 'active' | 'informatif' | 'experimental' | 'non_pris_en_charge'

export type SourceKind = 'article' | 'these' | 'extension' | 'gouvernement' | 'praticien'

/**
 * Niveau d'accès à la source, selon le dossier de références V2 (2026-11-06).
 * - corps_recupere : texte principal récupéré de bout en bout (figures non inspectées) ;
 * - lecture_substantielle : méthodes et résultats détaillés, fin ou annexes manquantes ;
 * - partiel : certaines parties seulement (une table des matières n'est pas un résultat lu) ;
 * - notice_seulement : notice ou citation secondaire ; - non_lu : rien récupéré.
 * Aucun niveau ne signifie « publication lue intégralement ».
 */
export type SourceVerification =
  'corps_recupere' | 'lecture_substantielle' | 'partiel' | 'notice_seulement' | 'non_lu'

/** Origine du contenu : synthèse documentaire fournie par l'utilisateur, à vérifier sur l'original. */
export type SourceProvenance = 'synthese_documentaire_fournie'

/** Niveaux qui permettent d'étayer une règle active (qualitative) — sous réserve de vérification finale. */
export const SUPPORTING_LEVELS: readonly SourceVerification[] = [
  'corps_recupere',
  'lecture_substantielle',
]

export interface RuleSource {
  citation: string
  kind: SourceKind
  doi?: string
  url?: string
  verification: SourceVerification
  /** Passages, pages ou sections sur lesquels s'appuie la règle. */
  locator?: string
  provenance?: SourceProvenance
  /** Date du dossier documentaire (AAAA-MM-JJ). */
  verifiedOn?: string
}

export interface RuleEntry {
  id: string
  title: string
  status: RuleStatus
  category: KnowledgeCategory
  sources: RuleSource[]
  /** Région et population étudiées. */
  region: string
  /** Saison, sexe, classe d'âge. */
  population: string
  /** Variable réellement étudiée. */
  variable: string
  /** Résultat, effet nul ou contradiction (paraphrase). */
  result: string
  /** Domaine d'application dans l'application. */
  domain: string
  /** Limites de transfert au Québec. */
  transferLimits: string
  dataNeeded: string[]
  nature: 'qualitative' | 'quantitative'
  /** `publie`: coefficient tiré d'une publication; `heuristique`: choix de conception; `aucun`. */
  coefficient: 'publie' | 'heuristique' | 'aucun'
  coefficientNote: string
  /** Identifiants exécutés par le moteur (obligatoire pour actif/expérimental). */
  implementedBy: string[]
}
