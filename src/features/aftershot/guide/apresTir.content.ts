/**
 * Contenu du guide « Après le tir » — STRUCTURE SEULEMENT.
 *
 * Aucun contenu expert n'est rédigé ici : réglementation, éthique de chasse,
 * lecture des traces de sang et délais de recherche exigent des sources
 * vérifiables et les droits de les reprendre. Tant qu'une section n'a pas de
 * `source` valide ET de texte, l'écran affiche « Contenu à venir — sources en
 * vérification » (voir `guideLogic.ts`).
 *
 * Pour publier une section : renseigner `body` (un paragraphe par entrée) ET
 * `source` (titre, éditeur, date de consultation, lien si public). Rien d'autre
 * à modifier dans l'interface.
 */

/** Référence vérifiable d'une section (obligatoire pour la publier). */
export interface GuideSource {
  /** Titre du document ou de la page citée. */
  title: string
  /** Organisme ou auteur (ministère, fédération, etc.). */
  publisher: string
  /** Date de consultation, `AAAA-MM-JJ`. */
  retrievedOn: string
  /** Lien public, si la source en a un. */
  url?: string
}

export interface GuideSection {
  id: string
  /** Sujet de la section (un intitulé, pas du contenu). */
  title: string
  /** Paragraphes, un par entrée. Vide tant que rien n'est sourcé. */
  body: readonly string[]
  /**
   * OBLIGATOIRE pour chaque section : `null` signifie « pas encore de source »,
   * et la section reste alors en « contenu à venir ».
   */
  source: GuideSource | null
}

export const APRES_TIR_SECTIONS: readonly GuideSection[] = [
  { id: 'reglementation', title: 'Réglementation applicable', body: [], source: null },
  {
    id: 'recherche-animal-blesse',
    title: 'Recherche d’un animal blessé',
    body: [],
    source: null,
  },
  { id: 'indices', title: 'Lecture des indices', body: [], source: null },
  { id: 'delais', title: 'Délais avant et pendant la recherche', body: [], source: null },
  { id: 'ethique', title: 'Éthique de chasse', body: [], source: null },
]
