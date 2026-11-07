/**
 * Sources of the « Repères saisonniers du rut » view. Each entry says exactly
 * what was read and when — nothing here is a calibrated local value.
 */
export interface RutSource {
  id: 'QUEBEC_ESPECE' | 'HUNSAKER_2025' | 'CEAEQ_2006'
  citation: string
  url?: string
  doi?: string
  /** Date printed on the page / record as seen during the consultation. */
  displayedDate?: string
  /** Date on which the content was actually consulted (ISO). */
  accessedOn: string
  /** What was really read. */
  readScope: string
  /** What the source does and does not say. */
  limits: string
  /** Honest note about an inconsistency between two consultations, if any. */
  discrepancy?: string
}

export const RUT_SOURCES: readonly RutSource[] = [
  {
    id: 'QUEBEC_ESPECE',
    citation:
      'Gouvernement du Québec, fiche « Cerf de Virginie » (Québec.ca, Faune et chasse).',
    url: 'https://www.quebec.ca/tourisme-et-loisirs/chasse/especes/cerf-de-virginie',
    displayedDate: 'Dernière mise à jour : 3 novembre 2026',
    accessedOn: '2026-11-07',
    readScope:
      'Page lue en ligne (texte de la fiche). La seule date affichée est celle de la mise à jour ci-contre.',
    limits:
      'Indique que la reproduction a lieu principalement en novembre et en décembre, une gestation moyenne d’environ 200 jours et des naissances de la fin mai au début juillet. Aucune date exacte de pic ni de variation régionale.',
    discrepancy:
      'Un autre assistant avait rapporté la date « 10 mars 2026 » pour cette page. Je n’ai observé que « 3 novembre 2026 » ; la différence n’est pas expliquée. Le contenu cité ci-dessus est celui que j’ai lu.',
  },
  {
    id: 'HUNSAKER_2025',
    citation:
      'Hunsaker et coll. (2025), Ecology and Evolution, DOI 10.1002/ece3.71589 — mâles munis de colliers GPS, sud-ouest du Wisconsin.',
    doi: '10.1002/ece3.71589',
    accessedOn: '2026-11-07',
    readScope:
      'Résumé seulement (notice de la USGS). Le texte intégral n’a pas pu être consulté depuis cet environnement.',
    limits:
      'Étude externe au Québec. Le repère du 23 octobre au 12 novembre est déduit des déplacements quotidiens de 188 mâles (2017–2020), pas de dates de conception ni de comportements observés au Québec. Non calibré pour votre territoire.',
  },
  {
    id: 'CEAEQ_2006',
    citation:
      'CEAEQ (2006), document sur le cerf de Virginie au Québec — citations de seconde main (Hesselton et Hesselton 1982 ; Goudreault 1980).',
    accessedOn: '2026-11-07',
    readScope:
      'Passages cités de seconde main ; les travaux d’origine n’ont pas été lus.',
    limits:
      'Mentionne des périodes d’accouplement variables selon les régions (début novembre au nord de l’aire ; mi-novembre à janvier à Anticosti). Donné en contexte, non utilisé comme calendrier.',
  },
]
