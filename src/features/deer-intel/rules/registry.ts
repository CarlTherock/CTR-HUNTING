import type { RuleEntry, RuleSource } from './types'

/** À incrémenter à chaque changement de règle, de source ou de coefficient. */
export const RULE_REGISTRY_VERSION = '1.1.0'

const V = '2026-11-06'
const PROV = 'synthese_documentaire_fournie' as const

/** Libellé affiché pour toute source dont le contenu vient du dossier de références V2. */
export const PROVENANCE_LABEL =
  'Synthèse documentaire fournie (dossier V2, 2026-11-06), à vérifier sur le texte original'

const WEBB: RuleSource = {
  citation:
    'Webb, S. L., Gee, K. L., Strickland, B. K., Demarais, S. et DeYoung, R. W. (2010). Measuring fine-scale white-tailed deer movements and environmental influences using GPS collars. International Journal of Ecology, 2010.',
  kind: 'article',
  doi: '10.1155/2010/459610',
  url: 'https://onlinelibrary.wiley.com/doi/10.1155/2010/459610',
  verification: 'lecture_substantielle',
  locator: 'Méthodes 2.1–2.4.5 ; résultats 3.1–3.4.3 ; tableaux 1–4 (R02)',
  provenance: PROV,
  verifiedOn: V,
}
const HUNSAKER: RuleSource = {
  citation:
    'Hunsaker, Gilbertson, Storm et Turner (2025). The breeding season and movement ecology of male white-tailed deer in southwest Wisconsin. Ecology and Evolution 15(7): e71589.',
  kind: 'article',
  doi: '10.1002/ece3.71589',
  url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12240682/',
  verification: 'lecture_substantielle',
  locator:
    'Résumé ; méthodes 2.1–2.4.4 ; résultats 3.1–3.4 ; début de discussion 4 (R01). Suppléments S1–S7 non récupérés',
  provenance: PROV,
  verifiedOn: V,
}
const SULLIVAN: RuleSource = {
  citation:
    'Sullivan, J. D., Ditchkoff, S. S., Collier, B. A., Ruth, C. R. et Raglin, J. B. (2016). Movement with the Moon: white-tailed deer activity and solunar events. Journal of the Southeastern Association of Fish and Wildlife Agencies 3: 225–232.',
  kind: 'article',
  url: 'https://seafwa.org/journal/2016/movement-moon-white-tailed-deer-activity-and-solunar-events',
  verification: 'corps_recupere',
  locator:
    'pp. 225–232 ; région : Methods / Study Area p. 226 (Brosnan Forest, comté de Dorchester, Caroline du Sud). Dates : le résumé indique août–décembre 2010–2012, les méthodes mentionnent des captures 2009–2011 et des acquisitions du 23 août au 23 novembre — différences conservées, non harmonisées. Figures non inspectées (R04)',
  provenance: PROV,
  verifiedOn: V,
}
const MSU: RuleSource = {
  citation:
    'Mississippi State University Extension (2025). Lunar Legends: Does the Moon Influence Buck Activity? Publication P4068 (auteurs à confirmer sur la dernière page). Vulgarisation universitaire ; évaluation par les pairs non établie.',
  kind: 'extension',
  url: 'https://extension.msstate.edu/sites/default/files/publications/P4068_Lunar_web.pdf',
  verification: 'lecture_substantielle',
  locator:
    'pp. 1–16 environ : protocole, synthèse p. 4, résultats p. 10–16 ; fin du document non récupérée (R05)',
  provenance: PROV,
  verifiedOn: V,
}
const GOETHLICH: RuleSource = {
  citation:
    'Goethlich, J. Effects of abiotic factors on white-tailed deer activity in South Carolina. Mémoire, Auburn University (page de titre : 2 mai 2019 ; copyright : 2020 — deux mentions distinctes, non harmonisées).',
  kind: 'these',
  url: 'https://etd.auburn.edu/bitstream/handle/10415/7077/Goethlich_Thesis.pdf?sequence=2',
  verification: 'partiel',
  locator:
    'Page de titre, résumé, table des matières p. 4–12, chapitre 1 (~p. 13–20). Chapitre 2 NON récupéré : méthodes p. 49–54, pression p. 62, tableau 2.2 p. 90, figures p. 111–116 (R06)',
  provenance: PROV,
  verifiedOn: V,
}
const COURBIN: RuleSource = {
  citation:
    'Courbin, N., Dussault, C., Veillette, A., Giroux, M.-A. et Côté, S. D. (2017). Coping with strong variations in winter severity: plastic habitat selection of deer at high density. Behavioral Ecology 28(4): 1037–1046.',
  kind: 'article',
  doi: '10.1093/beheco/arx062',
  url: 'https://academic.oup.com/beheco/article/28/4/1037/3745028',
  verification: 'lecture_substantielle',
  locator:
    'Introduction, méthodes (trois échelles), résultats, tableaux 1–3, début de discussion ; Anticosti ouest, 27 femelles, hivers 2009 et 2010 (R08)',
  provenance: PROV,
  verifiedOn: V,
}
const MASSE: RuleSource = {
  citation:
    'Massé, A. et Côté, S. D. (2013). Spatiotemporal variations in resources affect activity and movement patterns of white-tailed deer at high density. Canadian Journal of Zoology 91: 252–263.',
  kind: 'article',
  doi: '10.1139/cjz-2012-0297',
  url: 'https://cdnsciencepub.com/doi/pdf/10.1139/cjz-2012-0297',
  verification: 'lecture_substantielle',
  locator:
    'pp. 252–257 environ : résumé, méthodes, résultats, tableaux 1–2, début de discussion. Fin (p. 258–263) et suppléments S1–S4 non récupérés ; Anticosti, 24 femelles (R07)',
  provenance: PROV,
  verifiedOn: V,
}
const GUIDE_RAVAGES: RuleSource = {
  citation:
    'Hébert, Hénault, Lamoureux, Bélanger, Vachon et Dumont (2013). Guide d’aménagement des ravages de cerfs de Virginie, 4e édition, 62 p. Gouvernement du Québec (Anticosti exclu du domaine d’application principal).',
  kind: 'gouvernement',
  url: 'https://cdn-contenu.quebec.ca/cdn-contenu/faune/documents/habitats/amenagement-ravages-cerfs-virginie.pdf',
  verification: 'partiel',
  locator:
    'Auteurs/édition, sommaire, introduction, chap. 1.1–1.5 (~p. 10). MANQUENT : clé et tableau 6 (p. 19–20), cibles (p. 25–26), corridors (p. 30), connectivité (p. 33) (R14)',
  provenance: PROV,
  verifiedOn: V,
}
const GAGNON = (slug: string, title: string, locator: string): RuleSource => ({
  citation: `Gagnon, L. (blogue chevreuil.net, date de publication non établie) — « ${title} ». Conseil de praticien, pas une étude contrôlée.`,
  kind: 'praticien',
  url: `https://www.chevreuil.net/blogue-louis-gagnon/${slug}`,
  verification: 'corps_recupere',
  locator,
  provenance: PROV,
  verifiedOn: V,
})
const GAGNON_RUT = GAGNON(
  'le-rut-comment-le-chasser',
  'Le rut, comment le chasser',
  'Corps de l’article jusqu’à la signature (R17) ; pas de pagination stable',
)
const GAGNON_THERMO = GAGNON(
  'la-thermoregulation',
  'La thermorégulation',
  'Ensemble de l’article, navigation exclue (R18)',
)
const GAGNON_NOCTURNES = GAGNON(
  'chevreuils-nocturnes-quoi-faire-et-ne-pas-faire',
  'Chevreuils nocturnes : quoi faire et ne pas faire',
  'Section « Respecter le sanctuaire » ; « Chasser de façon imprévisible » ; exemple de semaine ; conclusion (R19)',
)

/**
 * Le registre. Les entrées `active` et `experimental` DOIVENT être exécutées par le
 * moteur (`implementedBy`); les autres ne changent aucun score.
 */
export const RULE_REGISTRY: readonly RuleEntry[] = [
  {
    id: 'ACT-CREPUSCULAR-01',
    title:
      'Activité de référence crépusculaire, ancrée sur le lever et le coucher locaux',
    status: 'active',
    category: 'B',
    sources: [WEBB, SULLIVAN, MASSE],
    region:
      'Sud de l’Oklahoma (Webb) ; Brosnan Forest, Caroline du Sud (Sullivan) ; Anticosti, Québec (Massé et Côté, femelles, haute densité)',
    population:
      'Webb : 17 femelles et 15 mâles ; Sullivan : 38 mâles, GPS 30 min ; Massé et Côté : 24 femelles adultes, GPS 2 h',
    variable: 'Rythme journalier d’activité ou de déplacement',
    result:
      'Rythmes surtout crépusculaires (Webb) ; le coucher du soleil reste la période la plus active parmi celles comparées (Sullivan) ; crépuscule favorable (Massé et Côté). Les populations, les sexes, les saisons et les intervalles GPS diffèrent.',
    domain:
      'Forme qualitative de la courbe de référence (deux pics aux heures solaires locales). Les hauteurs et largeurs des pics sont des choix de conception. Ce n’est ni une probabilité de rencontre ni une probabilité de présence.',
    transferLimits:
      'Aucune de ces populations n’est celle d’un territoire de chasse québécois continental ; le rythme varie avec la saison, le sexe, l’âge, la pression de chasse et le dérangement (Hunsaker : mâles âgés plus nocturnes au pic du rut).',
    dataNeeded: ['coordonnées', 'date', 'fuseau', 'lever et coucher du soleil'],
    nature: 'qualitative',
    coefficient: 'heuristique',
    coefficientNote:
      'Aucun coefficient publié utilisé : forme qualitative reprise, hauteurs de pics choisies (voir ACT-BASELINE-01).',
    implementedBy: ['ACT-CREPUSCULAR-01'],
  },
  {
    id: 'ACT-BASELINE-01',
    title: 'Niveau de base d’activité hors des pics (jour et nuit)',
    status: 'active',
    category: 'D',
    sources: [HUNSAKER],
    region: 'Sud-ouest du Wisconsin (contexte)',
    population: 'Mâles de 1,5 à 3,5 ans et plus, mi-octobre au 1er décembre',
    variable: 'Activité nocturne et diurne hors crépuscule',
    result:
      'Des déplacements existent la nuit et le jour (Hunsaker : transition plus nocturne chez les mâles plus âgés au pic). La Notice de Beier et McCullough (1990) n’a pas été lue au-delà de la notice et n’est pas invoquée.',
    domain:
      'Fixe un plancher non nul à la courbe (la nuit n’est jamais présentée comme « zéro activité »).',
    transferLimits: 'Niveaux relatifs non transférables tels quels.',
    dataNeeded: ['lever et coucher du soleil'],
    nature: 'quantitative',
    coefficient: 'heuristique',
    coefficientNote:
      'Plancher de 25/100 la nuit et de 18/100 le jour : choix de conception, non calibré.',
    implementedBy: ['ACT-BASELINE-01'],
  },
  {
    id: 'CND-WIND-DIRECTION-01',
    title: 'Compatibilité du vent avec le poste et les zones sensibles renseignés',
    status: 'active',
    category: 'C',
    sources: [GAGNON_NOCTURNES],
    region: 'Québec (expertise de terrain, petits territoires)',
    population: 'Sans objet (conseil de praticien, pas une étude contrôlée)',
    variable:
      'Direction du vent par rapport à l’orientation utile d’un poste et à l’accès',
    result:
      'Louis Gagnon affirme que le vent est prioritaire dans le choix du passage et que l’accès ne doit pas pousser l’odeur vers le sanctuaire ; il recommande au moins deux options de site à bon vent (« Respecter le sanctuaire »). Recommandation de praticien : ce n’est pas un coefficient scientifique et le produit n’est pas un « modèle Louis Gagnon ».',
    domain:
      'Indice de conditions de chasse (pas une activité animale). S’applique seulement si la personne renseigne les directions de vent favorables du poste ou une zone sensible ; sinon « non évaluée ». Direction circulaire (359° → 1° = 2°). Vent très faible : fiabilité de la direction signalée.',
    transferLimits:
      'Le vent de modèle à 10 m n’est pas un vent sous couvert ; aucune distance de détection ni direction thermique universelle n’est affirmée. Les chiffres de l’article (30 % de sanctuaire, 80 % de nocturnité, délais) ne sont pas repris.',
    dataNeeded: [
      'direction et vitesse du vent',
      'directions de vent favorables ou zone sensible',
    ],
    nature: 'qualitative',
    coefficient: 'heuristique',
    coefficientNote:
      'Seuils angulaires (22,5° / 90°) de conception ; aucun coefficient publié.',
    implementedBy: ['CND-WIND-DIRECTION-01'],
  },
  {
    id: 'CND-GUST-01',
    title: 'Rafales fortes : contrainte pratique',
    status: 'active',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Rafales de vent à 10 m',
    result: 'Aucune source : contrainte de confort et de bruit pour le chasseur.',
    domain: 'Indice de conditions de chasse uniquement.',
    transferLimits: 'Ne dit rien du comportement du cerf.',
    dataNeeded: ['rafales'],
    nature: 'quantitative',
    coefficient: 'heuristique',
    coefficientNote: 'Rampe linéaire de 25 à 55 km/h : choix de conception.',
    implementedBy: ['CND-GUST-01'],
  },
  {
    id: 'CND-PRECIP-01',
    title: 'Précipitations : contrainte pratique',
    status: 'active',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Précipitations horaires prévues',
    result:
      'Aucune source : confort et visibilité du chasseur. Aucun effet sur les déplacements du cerf n’est affirmé (pas de « pic après l’averse »).',
    domain: 'Indice de conditions de chasse uniquement.',
    transferLimits: 'Ne dit rien du comportement du cerf.',
    dataNeeded: ['précipitations horaires'],
    nature: 'quantitative',
    coefficient: 'heuristique',
    coefficientNote: 'Rampe linéaire de 0,2 à 2 mm/h : choix de conception.',
    implementedBy: ['CND-PRECIP-01'],
  },
  {
    id: 'IDX-COMBINE-01',
    title: 'Indice de créneau : 65 % activité de référence + 35 % conditions de chasse',
    status: 'active',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Indice comparatif de 0 à 100',
    result:
      'Indice comparatif, pas un pourcentage de présence ni une probabilité de récolte. Quand les conditions sont absentes, l’indice se limite à l’activité de référence et le dit.',
    domain:
      'Classement des heures et des fenêtres ; échelle absolue (pas de normalisation par jour).',
    transferLimits: 'Pondération non calibrée ; sensibilité testée (voir tests).',
    dataNeeded: ['activité de référence', 'conditions de chasse (facultatif)'],
    nature: 'quantitative',
    coefficient: 'heuristique',
    coefficientNote:
      'Poids 0,65 / 0,35 de conception ; variation 0,5–0,8 testée pour la robustesse.',
    implementedBy: ['IDX-COMBINE-01'],
  },
  {
    id: 'EXP-SOLUNAR-01',
    title: 'Hypothèse solunaire (expérimentale, opt-in, influence bornée)',
    status: 'experimental',
    category: 'D',
    sources: [SULLIVAN, MSU, WEBB],
    region:
      'Brosnan Forest, comté de Dorchester, Caroline du Sud (Sullivan, Methods p. 226) ; Mississippi central (MSU) ; sud de l’Oklahoma (Webb)',
    population:
      'Mâles adultes munis de colliers GPS (Sullivan : 38 mâles, 30 min ; MSU : 48 mâles, 15 min, septembre–février ; Webb : 15 mâles et 17 femelles)',
    variable: 'Activité vs lever/coucher de lune et passages haut/bas',
    result:
      'Contradictoire. Sullivan : près de la nouvelle ou pleine lune, l’activité binaire (probabilité sur 30 min) augmente dans les fenêtres de lever/coucher lunaire et diminue dans les fenêtres de passage supérieur/inférieur ; les auteurs contestent le classement commercial majeur/mineur et rappellent qu’activité accrue ≠ vulnérabilité accrue. MSU : aucun changement jugé important pour les phases et positions examinées ; le rut pèse bien plus. Webb : phase non associée aux mouvements (P ≥ 0,15).',
    domain:
      'Mode séparé, désactivé par défaut. Ajoute au plus ±6 points à l’activité de référence autour des événements lunaires, seulement près de la nouvelle ou pleine lune ; la comparaison avec/sans hypothèse est toujours affichée.',
    transferLimits:
      'Mâles adultes d’études du Sud-Est et du Sud des États-Unis ; aucune donnée québécoise. Les probabilités de Sullivan (par intervalle de 30 min) ne sont ni des taux de rencontre ni convertibles en pourcentages de chance de chasse ; le transit inférieur y est approximé à mi-chemin entre coucher et lever, méthode non réappliquée automatiquement.',
    dataNeeded: ['lever, coucher et passages de la lune', 'phase lunaire'],
    nature: 'qualitative',
    coefficient: 'heuristique',
    coefficientNote:
      'Direction de l’effet reprise de Sullivan 2016 ; ampleur (±6 points), demi-largeur de 45 min et seuil de phase de conception, non publiés.',
    implementedBy: ['EXP-SOLUNAR-01'],
  },
  {
    id: 'INF-MOON-01',
    title: 'Informations lunaires (phase, fraction éclairée, lever/coucher, passages)',
    status: 'informatif',
    category: 'B',
    sources: [MSU, SULLIVAN, WEBB],
    region: 'Voir EXP-SOLUNAR-01',
    population: 'Voir EXP-SOLUNAR-01',
    variable: 'Position et phase de la lune',
    result:
      'Affichées pour la planification ; aucun bonus par défaut (résultats contradictoires). La lune au-dessus de l’horizon, la fraction éclairée et la couverture nuageuse sont trois choses distinctes ; les nuages ne sont pas pris en compte dans l’analyse de phase de Webb ; aucune luminosité en lux n’est calculée.',
    domain: 'Affichage seulement.',
    transferLimits: 'Voir EXP-SOLUNAR-01.',
    dataNeeded: ['coordonnées', 'date', 'fuseau'],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'INF-PRESSURE-01',
    title: 'Pression atmosphérique et tendance (contexte)',
    status: 'informatif',
    category: 'D',
    sources: [WEBB, GOETHLICH],
    region:
      'Sud de l’Oklahoma (Webb) ; Caroline du Sud (Goethlich, chapitre 2 non récupéré)',
    population: 'Cerfs adultes munis de colliers GPS',
    variable: 'Pression barométrique',
    result:
      'Webb : seulement 8 modèles linéaires météo sur 80 significatifs (11/80 pour les extrêmes, 10/80 pour les changements journaliers), sans réponse générale cohérente ; données d’une station à 18 km. Les résultats de pression de Goethlich (chapitre 2, p. 62, tableau 2.2 p. 90, figures p. 111–116) n’ont PAS été récupérés : aucune règle comportementale n’en est tirée. Aucune loi « haute pression = bon » ou « baisse = activité accrue ».',
    domain:
      'Affiche la pression de SURFACE (station) du fournisseur et sa variation sur 3 h ; aucun seuil publié pour la pression au niveau de la mer n’est comparé à cette valeur. Règle comportementale en attente des pages du chapitre 2.',
    transferLimits: 'Sud-Est et Sud des États-Unis ; direction et ampleur non lues.',
    dataNeeded: ['pression de surface horaire'],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient : contexte seulement.',
    implementedBy: [],
  },
  {
    id: 'INF-TEMP-01',
    title: 'Température et évolution récente (contexte)',
    status: 'informatif',
    category: 'B',
    sources: [HUNSAKER, MASSE, GAGNON_THERMO],
    region: 'Sud-ouest du Wisconsin ; Anticosti (Québec) ; praticien (Canada)',
    population: 'Mâles en rut (Hunsaker) ; femelles à haute densité (Massé et Côté)',
    variable: 'Température de l’air',
    result:
      'Hunsaker : pas d’effet significatif des variables de température examinées (minimale, maximale, ampleur) dans le modèle retenu — cela ne prouve pas que toute la météo a été testée. Massé et Côté : l’effet estival de la température sur le budget d’activité est associé à des modèles expliquant environ 1 % de la variance ; modèles hivernaux plus informatifs. Gagnon (praticien) : scénarios saisonniers qui varient avec la météo, le couvert et la saison.',
    domain:
      'Affiche la température et le changement depuis la veille à la même heure (« baisse depuis hier »). Aucune « anomalie » sans normale climatique ; aucune règle « plus froid = mieux » ; les seuils d’expert (+5 à +6 °C, −10 °C) ne sont pas des lois.',
    transferLimits: 'Contextes différents ; non appliqué comme seuil.',
    dataNeeded: ['température horaire'],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'INF-RUT-01',
    title: 'Contexte saisonnier : période de reproduction (tendance publiée)',
    status: 'informatif',
    category: 'B',
    sources: [HUNSAKER, WEBB, MSU],
    region: 'Sud-ouest du Wisconsin ; sud de l’Oklahoma ; Mississippi central',
    population:
      'Mâles (Hunsaker : 188 mâles, mi-octobre au 1er décembre 2017–2020, suivis répétés possibles)',
    variable: 'Date du pic de reproduction et déplacements des mâles',
    result:
      'Wisconsin : période intense vers le 23 octobre–12 novembre (début et fin varient selon la métrique), mouvements moyens maximaux la semaine du 5–11 novembre ; les mâles de 2,5 ans se déplacent davantage ; les plus âgés montrent une transition plus nocturne au pic. Oklahoma : mouvement moyen des mâles environ 20 % plus élevé au rut qu’après, mais le test donne P = 0,07 (non significatif au seuil de 0,05). Mississippi : le rut pèse bien plus que la lune.',
    domain:
      'Texte de contexte avec la région de l’étude, jamais une prédiction locale ni un facteur du score. Aucune date locale précise n’est inventée.',
    transferLimits:
      'Ne pas transférer le calendrier au Québec par simple correction de latitude ; non vérifié pour le Québec.',
    dataNeeded: ['date'],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'INF-SNOW-01',
    title: 'Neige au sol et chute récente (contexte hivernal)',
    status: 'informatif',
    category: 'B',
    sources: [COURBIN, MASSE],
    region: 'Anticosti (Québec)',
    population:
      'Femelles adultes à haute densité, sans prédateurs (Courbin : 27 femelles, hivers 2009 rude et 2010 doux ; Massé et Côté : 24 femelles)',
    variable: 'Profondeur de neige, enfoncement et sévérité hivernale',
    result:
      'Massé et Côté : activité de 59 ± 2 % en été contre 35 ± 2 % en hiver ; neige profonde et enfoncement ne sont pas interchangeables. Courbin : l’enfoncement pénalise l’utilisation des pistes (seuils décrits d’environ 10 cm en hiver doux et 30 cm en hiver rude), mesure d’ENFONCEMENT et non profondeur de neige.',
    domain:
      'Affiche la neige au sol et la chute prévues. La profondeur prévue ne donne PAS l’enfoncement des sabots ; aucun seuil d’enfoncement n’est appliqué. Une zone riche en nourriture peut réduire le besoin de déplacement.',
    transferLimits:
      'Anticosti : haute densité, forte pression de broutage, femelles en hiver ; non transférable aux mâles en rut d’un boisé continental du sud du Québec.',
    dataNeeded: ['profondeur de neige', 'chute de neige'],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'UNS-FRONT-01',
    title: 'Front météo « confirmé »',
    status: 'non_pris_en_charge',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Passage de front',
    result:
      'Pas de méthode adaptée ; pression + vent + température ne sont pas combinés en « front ».',
    domain: 'Non calculé.',
    transferLimits: 'Sans objet.',
    dataNeeded: [],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'UNS-LUX-01',
    title: 'Luminosité nocturne en lux',
    status: 'non_pris_en_charge',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Éclairement lunaire',
    result: 'Aucune méthode physique calibrée disponible.',
    domain: 'Non calculé.',
    transferLimits: 'Sans objet.',
    dataNeeded: [],
    nature: 'quantitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'UNS-SNOW-SINKING-01',
    title: 'Enfoncement des sabots dans la neige',
    status: 'non_pris_en_charge',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Enfoncement / croûte',
    result: 'Une profondeur prévue ne donne pas l’enfoncement ; aucune donnée de croûte.',
    domain: 'Non calculé.',
    transferLimits: 'Sans objet.',
    dataNeeded: [],
    nature: 'quantitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'UNS-BAIT-01',
    title: 'Appâtage, saline, leurre',
    status: 'non_pris_en_charge',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Appâts',
    result: 'Règles actuelles non vérifiées : aucune recommandation automatique.',
    domain: 'Non proposé.',
    transferLimits: 'Sans objet.',
    dataNeeded: [],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'UNS-THERMAL-01',
    title: 'Vent local et thermiques sous couvert',
    status: 'non_pris_en_charge',
    category: 'D',
    sources: [],
    region: 'Sans objet',
    population: 'Sans objet',
    variable: 'Courants thermiques de versant / vallée',
    result:
      'Pas de donnée ni de méthode ; pente sud = site chaud et vallée = courant ne sont pas supposés.',
    domain: 'Non calculé.',
    transferLimits: 'Sans objet.',
    dataNeeded: [],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'UNS-WINTER-YARD-01',
    title: 'Habitat hivernal / ravage (clé du guide québécois)',
    status: 'non_pris_en_charge',
    category: 'B',
    sources: [GUIDE_RAVAGES],
    region: 'Québec continental (Anticosti exclu du guide)',
    population: 'Cerf de Virginie en hiver',
    variable: 'Critères d’aménagement d’un ravage',
    result:
      'Seuls l’édition, les auteurs, le sommaire et les chapitres 1.1–1.5 sont récupérés : proximité nourriture/abri et coûts de déplacement hivernaux structurants. La clé (p. 19–20), le tableau 6, les cibles, les corridors (p. 30) et la connectivité (p. 33) manquent : aucune classification n’en est tirée. Les objectifs d’aménagement ne sont pas des probabilités de présence, et les pages légales de 2013 ne sont pas la réglementation actuelle.',
    domain:
      'Non pris en charge ; couche hivernale indisponible tant que la clé n’est pas obtenue.',
    transferLimits:
      'Les critères hivernaux ne s’appliquent pas toute l’année ; ne pas fusionner avec les règles d’Anticosti.',
    dataNeeded: [],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'PRAC-GAGNON-RUT-01',
    title: 'Conseils de terrain : « Le rut, comment le chasser »',
    status: 'informatif',
    category: 'C',
    sources: [GAGNON_RUT],
    region: 'Québec (conseil d’auteur)',
    population: 'Praticien',
    variable: 'Conseils de chasse pendant le rut',
    result:
      'Pré-rut : ressources alimentaires à couvert et sécurité ; au rut : couloirs naturels et concentrations de femelles selon l’auteur ; la météo oriente le secteur et la technique. Dates (20 octobre–10 novembre) et « journée idéale » ne sont pas un modèle calibré ; appâts, urines et leurres évoqués : aucune recommandation automatique.',
    domain: 'Texte de contexte distinct de la base scientifique ; aucun score.',
    transferLimits:
      'Ne pas appeler le produit « modèle Louis Gagnon » ; pas d’approbation sous-entendue.',
    dataNeeded: [],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'PRAC-GAGNON-THERMO-01',
    title: 'Conseils de terrain : « La thermorégulation »',
    status: 'informatif',
    category: 'C',
    sources: [GAGNON_THERMO],
    region: 'Canada, Québec, Ontario (observations d’auteur)',
    population: 'Praticien',
    variable: 'Thermorégulation et choix du couvert',
    result:
      'Scénarios saisonniers : début d’automne froid/pluie/vent → couvert protecteur proche de la nourriture ; fin octobre/novembre : ralentissement par chaleur anormale, amélioration possible après refroidissement ; fin novembre/décembre : stratégie différente avec froid intense et abri. Les seuils (+5 à +6 °C, −10 °C), dates et suggestions de nourrissage ne sont pas repris.',
    domain:
      'Texte de contexte distinct de la base scientifique ; aucune pénalité universelle de froid ou de chaleur.',
    transferLimits: 'Pas de normale climatique ni d’incertitude fournie par l’auteur.',
    dataNeeded: [],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
  {
    id: 'PRAC-GAGNON-NOCTURNES-01',
    title: 'Conseils de terrain : « Chevreuils nocturnes : quoi faire et ne pas faire »',
    status: 'informatif',
    category: 'C',
    sources: [GAGNON_NOCTURNES],
    region: 'Québec (petits territoires)',
    population: 'Praticien',
    variable: 'Accès, sanctuaire, postes de remplacement',
    result:
      'Le vent est prioritaire pour le choix du passage ; l’accès ne doit pas pousser l’odeur dans le sanctuaire ; au moins deux options de site à bon vent ; préserver les zones tranquilles. L’article propose aussi une intrusion en fin de séquence : ne pas retenir seulement les passages favorables à une doctrine. Aucune distance de détection certaine ni validation locale.',
    domain:
      'Source de la règle pratique CND-WIND-DIRECTION-01 ; les comparaisons de postes alternatifs viendront avec les points candidats.',
    transferLimits:
      '30 % de sanctuaire, 80 % de nocturnité et délais d’absence ne sont pas des règles scientifiques.',
    dataNeeded: [],
    nature: 'qualitative',
    coefficient: 'aucun',
    coefficientNote: 'Aucun coefficient.',
    implementedBy: [],
  },
]

export function getRule(id: string): RuleEntry | undefined {
  return RULE_REGISTRY.find((r) => r.id === id)
}

export function rulesByStatus(status: RuleEntry['status']): RuleEntry[] {
  return RULE_REGISTRY.filter((r) => r.status === status)
}

/** Niveau d'accès réel par référence (R01–R19), d'après le dossier V2 du 2026-11-06. */
export interface BibliographyEntry {
  ref: string
  citation: string
  verification: RuleSource['verification']
  /** Passages effectivement couverts. */
  locator: string
  /** Ce qu'il faut encore obtenir avant toute règle quantitative. */
  missing: string
}

export const BIBLIOGRAPHY: readonly BibliographyEntry[] = [
  {
    ref: 'R01',
    citation: 'Hunsaker et coll. 2025, Ecol. Evol. 15(7): e71589 (10.1002/ece3.71589)',
    verification: 'lecture_substantielle',
    locator: 'Résumé ; méthodes 2.1–2.4.4 ; résultats 3.1–3.4 ; début de discussion',
    missing:
      'Fin de discussion, conclusion, suppléments S1 et tableaux S1–S7 ; aucun polynôme de courbe certifié.',
  },
  {
    ref: 'R02',
    citation: 'Webb et coll. 2010, Int. J. Ecology (10.1155/2010/459610)',
    verification: 'lecture_substantielle',
    locator: 'Méthodes 2.1–2.4.5 ; résultats 3.1–3.4.3 ; tableaux 1–4',
    missing: 'Fin du texte, discussion et figures.',
  },
  {
    ref: 'R03',
    citation: 'Beier et McCullough 1990, Wildlife Monographs 109',
    verification: 'notice_seulement',
    locator: 'Notice et citations secondaires',
    missing: 'Monographie originale (effectifs, contexte, résultats).',
  },
  {
    ref: 'R04',
    citation: 'Sullivan et coll. 2016, JSAFWA 3: 225–232',
    verification: 'corps_recupere',
    locator: 'pp. 225–232 ; région : Methods p. 226 (Brosnan Forest, Caroline du Sud)',
    missing:
      'Inspection des figures ; version éditeur et données ; évaluation de la transférabilité du modèle.',
  },
  {
    ref: 'R05',
    citation: 'MSU Extension P4068 (2025), auteurs à confirmer',
    verification: 'lecture_substantielle',
    locator: 'pp. 1–16 environ',
    missing:
      'Fin du PDF, auteurs, limites détaillées, article scientifique associé éventuel.',
  },
  {
    ref: 'R06',
    citation: 'Goethlich, mémoire Auburn (page de titre 2 mai 2019 ; copyright 2020)',
    verification: 'partiel',
    locator: 'Page de titre, résumé, table des matières, chapitre 1',
    missing:
      'Chapitre 2 : méthodes p. 49–54, vent p. 59–60, pression p. 62, lune p. 67–69, discussion p. 71–79, tableau 2.2 p. 90, figures p. 111–116. INDISPENSABLE pour toute règle de pression.',
  },
  {
    ref: 'R07',
    citation: 'Massé et Côté 2013, Can. J. Zool. 91: 252–263 (10.1139/cjz-2012-0297)',
    verification: 'lecture_substantielle',
    locator: 'pp. 252–257 environ',
    missing: 'p. 258–263, tableau 3, suppléments S1–S4 (pour reproduire un modèle).',
  },
  {
    ref: 'R08',
    citation: 'Courbin et coll. 2017, Behav. Ecol. 28(4): 1037–1046',
    verification: 'lecture_substantielle',
    locator: 'Introduction, méthodes, résultats, tableaux 1–3, début de discussion',
    missing:
      'Fin de discussion, figures, suppléments (aucun coefficient copié isolément).',
  },
  {
    ref: 'R09',
    citation: 'Dumont et coll. 2005, Écoscience 12(4): 476–484',
    verification: 'non_lu',
    locator: 'Lien original échoué',
    missing: 'Article original, seulement si une règle en dépend.',
  },
  {
    ref: 'R10',
    citation: 'Landscape Ecology 2024 (10.1007/s10980-024-01879-z), titre incomplet',
    verification: 'notice_seulement',
    locator: 'Notice de recherche antérieure',
    missing: 'Titre, auteurs, méthodes, résultats.',
  },
  {
    ref: 'R11',
    citation: 'Individual heterogeneity in resource selection (10.1002/ecs2.3064), 2020',
    verification: 'notice_seulement',
    locator: 'Notice de recherche antérieure',
    missing: 'Titre, auteurs, protocole.',
  },
  {
    ref: 'R12',
    citation:
      'Hunting intensity alters movement behaviour of white-tailed deer (notice AGRIS)',
    verification: 'notice_seulement',
    locator: 'Notice secondaire',
    missing: 'Article original, année, auteurs.',
  },
  {
    ref: 'R13',
    citation: 'Studying deer habitat on Anticosti Island (2004), titre incomplet',
    verification: 'notice_seulement',
    locator: 'Notice de recherche antérieure',
    missing: 'Titre complet, auteurs, protocole.',
  },
  {
    ref: 'R14',
    citation:
      'Hébert et coll. 2013, Guide d’aménagement des ravages de cerfs de Virginie, 4e éd.',
    verification: 'partiel',
    locator: 'Auteurs/édition, sommaire, introduction, chap. 1.1–1.5 (~p. 10)',
    missing:
      'Sections 2.1–2.2 p. 11–21 et tableau 6 p. 20 (clé p. 19–20) ; 3.6.2 et 3.6.5 (corridors p. 30, connectivité p. 33). INDISPENSABLE pour les couches nourriture/abri et corridors.',
  },
  {
    ref: 'R15',
    citation: 'Aire de confinement du cerf de Virginie (Québec.ca)',
    verification: 'notice_seulement',
    locator: 'Page repérée, non relue',
    missing: 'Contenu et date actuels avant toute information réglementaire.',
  },
  {
    ref: 'R16',
    citation: 'Cerf de Virginie — fiche espèce (Québec.ca)',
    verification: 'notice_seulement',
    locator: 'Page repérée, non relue',
    missing: 'Passages utilisés, le cas échéant.',
  },
  {
    ref: 'R17',
    citation: 'Gagnon, Le « rut », comment le chasser',
    verification: 'corps_recupere',
    locator: 'Corps de l’article jusqu’à la signature',
    missing: 'Aucune source scientifique détaillée par l’auteur ; pas de coefficient.',
  },
  {
    ref: 'R18',
    citation: 'Gagnon, La thermorégulation',
    verification: 'corps_recupere',
    locator: 'Ensemble de l’article',
    missing: 'Aucune bibliographie quantitative ni incertitude fournie.',
  },
  {
    ref: 'R19',
    citation: 'Gagnon, Chevreuils nocturnes : quoi faire et ne pas faire',
    verification: 'corps_recupere',
    locator:
      'Sections « Respecter le sanctuaire », « Chasser de façon imprévisible », exemple de semaine, conclusion',
    missing: 'Aucune validation locale ni distance de détection fournie.',
  },
]
