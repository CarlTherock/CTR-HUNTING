import type { AnatomySheet } from '../types'

const DEER_DOC = { deer: 'documenté', moose: 'non confirmé' } as const
const ALL_DOC = { deer: 'documenté', moose: 'documenté' } as const

/** Sheets in the project's own words. A sheet with no valid source is never
 * shown (`isSheetPublished`). Nothing here is a diagnosis, a probability or a
 * waiting time. */
export const ANATOMY_SHEETS: readonly AnatomySheet[] = [
  {
    id: 'zone-coeur-poumons',
    kind: 'anatomie',
    title: 'Zone cœur-poumons',
    regionIds: ['thorax'],
    body: [
      'Les gabarits de tir publiés par l’Alaska recommandent la zone du cœur et des poumons pour viser une mort rapide, toutes espèces de gros gibier confondues.',
      'Pour l’orignal, la même page décrit cette zone comme la plus grande zone vitale de l’animal, d’environ la taille d’un ballon de basket.',
      'Les os de l’épaule peuvent se trouver entre la trajectoire et ces organes : le dessin ne montre pas ce que le projectile a traversé.',
    ],
    applicability: ALL_DOC,
    context: 'Gros gibier d’Alaska (tir de flanc), source officielle.',
    uncertainty:
      'La page ne donne pas de mesures pour le cerf et ne décrit pas l’intérieur de la poitrine ; l’ellipse du dessin est un schéma d’orientation.',
    sourceIds: ['adfg-shot'],
  },
  {
    id: 'observations-poitrine',
    kind: 'observations',
    title: 'Observations possibles après un tir dans la poitrine',
    regionIds: ['thorax'],
    body: [
      'Le Texas décrit, pour un tir de flanc dans le cœur ou les poumons chez le cerf, une réaction typique : un bond ou un cabrage, puis une fuite à la course, souvent dans la direction où l’animal faisait face.',
      'MeatEater note qu’un bond vertical le dos voûté peut accompagner un tir bien placé. Une réaction n’est cependant pas une preuve de l’endroit touché.',
      'À consigner si vous l’avez observé : la réaction, la direction de fuite, les bruits entendus, l’heure.',
    ],
    applicability: DEER_DOC,
    context: 'Cerf, tir de flanc (Texas, MeatEater).',
    uncertainty:
      'Les réactions varient d’un animal à l’autre ; ces sources ne donnent aucune fréquence et ne concernent pas l’orignal.',
    sourceIds: ['tpwd-after-shot', 'meateater-track'],
  },
  {
    id: 'epaule',
    kind: 'anatomie',
    title: 'Épaule',
    regionIds: ['shoulder', 'neck'],
    body: [
      'La page de l’Alaska signale que les os de l’épaule peuvent gêner le passage du projectile vers les organes vitaux, quelle que soit l’espèce de gros gibier.',
      'MeatEater range les atteintes aux pattes, à l’épaule, au poitrail et au cou parmi les cas où le sang est mince et espacé, parfois avec des fragments d’os, et les qualifie de préoccupantes.',
    ],
    applicability: ALL_DOC,
    context: 'Gros gibier (Alaska) ; gibier en général (MeatEater, exemples de cerf).',
    uncertainty:
      'Aucune source consultée ne chiffre l’effet d’une atteinte à l’épaule sur la survie.',
    sourceIds: ['adfg-shot', 'meateater-track'],
  },
  {
    id: 'arriere-cotes-abdomen',
    kind: 'indices',
    title: 'Arrière des côtes et abdomen',
    regionIds: ['rear-ribs', 'flank'],
    body: [
      'Hunter-Ed (Nouvelle-Galles du Sud) indique qu’un liquide verdâtre, clair ou contenant des matières digestives peut signaler une atteinte à l’intestin.',
      'MeatEater associe un animal qui se tapit ou s’affaisse à un tir trop en arrière, et décrit un sang mêlé d’herbe ou de nourriture comme un indice d’estomac ou d’intestins.',
      'HuntStand parle d’un sang brun ou vert pour un tir au ventre. Pour le foie, les sources ne s’accordent pas sur l’aspect : MeatEater parle d’un sang presque noir, HuntStand d’un rouge foncé.',
      'Le dessin ne localise ni le foie, ni la panse, ni les intestins : les sources lues les citent sans en donner la position.',
    ],
    applicability: DEER_DOC,
    context: 'Cerf (HuntStand, MeatEater) ; sang sans espèce précisée (Hunter-Ed).',
    uncertainty:
      'Divergence sur la couleur du sang attribuée au foie. Ce sont des possibilités, pas des conclusions : la couleur dépend aussi du sol, de la lumière et du temps écoulé.',
    sourceIds: ['hunter-ed-blood', 'meateater-track', 'huntstand-deer'],
  },
  {
    id: 'dos-colonne',
    kind: 'observations',
    title: 'Dos et colonne',
    regionIds: ['back'],
    body: [
      'MeatEater indique que si l’arrière-train s’effondre alors que les pattes avant tirent encore, la colonne peut être touchée, et que l’animal peut tomber sans mourir tout de suite.',
      'Cette source ajoute qu’un second tir rapide peut alors être nécessaire pour éviter les souffrances. La conduite à tenir dans ce cas au Québec n’est pas couverte ici : voir la réglementation, qui reste à intégrer.',
    ],
    applicability: DEER_DOC,
    context: 'Gibier en général, exemples de cerf (MeatEater).',
    uncertainty: 'Source unique ; non recoupée par les autres pages consultées.',
    sourceIds: ['meateater-track'],
  },
  {
    id: 'arriere-train',
    kind: 'anatomie',
    title: 'Arrière-train et cuisse',
    regionIds: ['hindquarter', 'hind-leg'],
    body: [
      'La page de l’Alaska déconseille le tir sur un animal qui s’éloigne : aucun organe vital ne se trouve directement sur la trajectoire et le risque de blessure est élevé.',
      'MeatEater range les atteintes musculaires des membres parmi les cas préoccupants, avec un sang mince et espacé.',
    ],
    applicability: ALL_DOC,
    context: 'Gros gibier (Alaska, tir de dos) ; gibier en général (MeatEater).',
    uncertainty:
      'La page de l’Alaska traite d’un tir de dos, pas d’un impact sur la cuisse d’un animal vu de profil.',
    sourceIds: ['adfg-shot', 'meateater-track'],
  },
  {
    id: 'pattes',
    kind: 'observations',
    title: 'Pattes',
    regionIds: ['front-leg', 'hind-leg'],
    body: [
      'MeatEater note qu’un membre qui s’agite après le tir peut signaler une patte touchée plutôt qu’une zone vitale.',
    ],
    applicability: DEER_DOC,
    context: 'Gibier en général, exemples de cerf (MeatEater).',
    uncertainty: 'Source unique ; simple possibilité.',
    sourceIds: ['meateater-track'],
  },
  {
    id: 'indices-sang',
    kind: 'indices',
    title: 'Lire le sang sans conclure',
    regionIds: [],
    body: [
      'Hunter-Ed (Nouvelle-Galles du Sud) présente comme des possibilités : rouge vif (artère), rouge plus foncé (veine), mousseux ou avec bulles (poumon), verdâtre ou avec matières digestives (intestin).',
      'MeatEater et HuntStand décrivent des correspondances semblables et d’autres plus détaillées, mais leurs descriptions de la couleur ne coïncident pas toujours (par exemple pour le foie).',
      'Le sang séché est brun et passe facilement inaperçu sur des feuilles ou de l’herbe brunes. HuntStand rappelle qu’environ un homme sur dix est daltonien et suggère de faire vérifier le sang par une personne qui ne l’est pas.',
      'Un indice se consigne : où, quand, couleur vue, aspect, photo. Il ne remplace pas la recherche sur le terrain.',
    ],
    applicability: DEER_DOC,
    context: 'Sang sans espèce précisée (Hunter-Ed) ; cerf (HuntStand, MeatEater).',
    uncertainty:
      'Les trois sources disent que ces correspondances sont des possibilités. Elles divergent sur certains détails (foie).',
    sourceIds: ['hunter-ed-blood', 'huntstand-deer', 'meateater-track'],
  },
  {
    id: 'organisation-recherche',
    kind: 'organisation',
    title: 'Organiser la recherche',
    regionIds: [],
    body: [
      'Avant le tir, repérer des points de repère autour de l’animal facilite le retour à l’endroit exact (Texas). Après le tir, noter l’heure.',
      'Hunter-Ed (national) et le Texas conseillent de revenir à l’endroit précis où se trouvait l’animal et d’y chercher sang, poils, os, branches brisées, même si l’on croit avoir manqué.',
      'Marquer les indices avec du ruban de signalisation visible, avancer lentement, rester sur le côté de la piste pour la préserver, et retirer le balisage ensuite. Travailler à deux : l’un suit la piste, l’autre observe devant (HuntStand).',
      'Si la piste se perd, Hunter-Ed conseille de chercher en cercle ou en quadrillage depuis le dernier indice.',
      'Dans l’application, chaque indice peut être posé sur la carte (Caméra sang, + Repère) et retrouvé comme « dernier indice ».',
    ],
    applicability: DEER_DOC,
    context: 'Cerf, sources américaines ; non vérifié pour l’orignal.',
    uncertainty:
      'Ces pages ne disent pas quand demander de l’aide, ne couvrent pas l’orignal et ne tiennent pas compte des règles québécoises.',
    sourceIds: ['tpwd-after-shot', 'hunter-ed-trailing', 'huntstand-deer'],
  },
]

export function sheetsFor(regionId: string | null): AnatomySheet[] {
  return ANATOMY_SHEETS.filter(
    (sheet) => regionId !== null && sheet.regionIds.includes(regionId),
  )
}

export function generalSheets(): AnatomySheet[] {
  return ANATOMY_SHEETS.filter((sheet) => sheet.regionIds.length === 0)
}
