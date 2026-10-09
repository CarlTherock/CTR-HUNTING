/** Statut d'une phase de la feuille de route. */
export type PhaseStatus = 'todo' | 'in-progress' | 'partial' | 'done'

/** Niveaux de validation, à ne pas confondre. */
export type ValidationState = 'yes' | 'partial' | 'no'

export interface PhaseValidation {
  /** Le code existe dans l'application. */
  implemented: ValidationState
  /** Tests automatisés (Vitest). */
  automated: ValidationState
  /** E2E sous Chromium, services SIMULÉS : n'est pas un essai sur appareil. */
  browser: ValidationState
  /** Essai sur iPhone / Android réels. Rien n'est documenté comme fait. */
  device: ValidationState
}

export interface RoadmapPhase {
  phase: number
  label: string
  /** Objectif en une phrase. */
  objective: string
  status: PhaseStatus
  /** Fonctions réellement livrées. */
  delivered: readonly string[]
  /** Travail restant (vide si rien n'est connu). */
  remaining: readonly string[]
  /** Validations qui manquent encore, dites franchement. */
  missingValidation: readonly string[]
  validation: PhaseValidation
}

export interface PriorityItem {
  level: 'P1' | 'P2'
  title: string
  why: string
  /** Phase(s) concernée(s). */
  phases: readonly number[]
}

const NO_DEVICE = 'Essai sur iPhone / Android réels : non fait.'

const V_DONE: PhaseValidation = {
  implemented: 'yes',
  automated: 'yes',
  browser: 'partial',
  device: 'no',
}

/**
 * Source UNIQUE de la progression du projet : la page « Projet et progression »,
 * la carte de l'accueil et « À propos » lisent tous ce tableau. Il reprend
 * `docs/ROADMAP_STATUS.md` et le tableau des phases de `PROJECT_SPECIFICATION.md`
 * (mettre à jour les trois ensemble). Aucune phase n'est déclarée terminée sans
 * que ce soit vrai : les phases 14 à 17 ne le sont pas.
 */
export const ROADMAP: readonly RoadmapPhase[] = [
  {
    phase: 0,
    label: 'Fondations',
    objective: 'Socle React, TypeScript strict, PWA, design system, tests.',
    status: 'done',
    delivered: [
      'Application, navigation, design system',
      'Stockage local (Dexie)',
      'PWA',
    ],
    remaining: [],
    missingValidation: [NO_DEVICE],
    validation: V_DONE,
  },
  {
    phase: 1,
    label: 'Carte',
    objective: 'Carte 2D, GPS, fonds et premières couches.',
    status: 'done',
    delivered: [
      'Fonds satellite, topo, plan',
      'GPS et recentrage',
      'Couches territoriales',
    ],
    remaining: [],
    missingValidation: [
      'Vrais fournisseurs de cartes : seuls des services simulés sont testés.',
      NO_DEVICE,
    ],
    validation: V_DONE,
  },
  {
    phase: 2,
    label: 'Points de repère et traces',
    objective: 'Enregistrer des points, des traces et les partager.',
    status: 'done',
    delivered: [
      'Waypoints, catégories, photos, coordonnées verrouillées',
      'Traces durables, couleurs, reprise',
      'Recherche de sang et indices',
      'Territoires',
    ],
    remaining: [],
    missingValidation: ['GPS réel (iPhone) : non essayé.', NO_DEVICE],
    validation: V_DONE,
  },
  {
    phase: 3,
    label: 'Hors ligne',
    objective: 'Cartes et données utilisables sans réseau.',
    status: 'done',
    delivered: ['Zones téléchargées, reprise du téléchargement', 'Service worker'],
    remaining: [],
    missingValidation: [
      'Zone réellement téléchargée puis rechargée en mode avion : non essayé.',
      NO_DEVICE,
    ],
    validation: V_DONE,
  },
  {
    phase: 4,
    label: 'Terrain 3D',
    objective: 'Relief et vue 3D de la carte.',
    status: 'done',
    delivered: ['Relief 3D, exagération verticale', 'Altitude'],
    remaining: [],
    missingValidation: ['Rendu 3D sur appareil réel : non essayé.'],
    validation: V_DONE,
  },
  {
    phase: 5,
    label: 'Météo',
    objective: 'Conditions et prévisions réellement récupérées.',
    status: 'done',
    delivered: [
      'Conditions actuelles et prévision horaire',
      'Cache et heure des données',
    ],
    remaining: [],
    missingValidation: ['Fournisseur réel : seuls des services simulés sont testés.'],
    validation: V_DONE,
  },
  {
    phase: 6,
    label: 'Vent',
    objective: 'Vent prévu, direction d’origine, rafales.',
    status: 'done',
    delivered: [
      'Champ de vent animé',
      'Direction et vitesse par heure',
      'Vent favorable par point',
    ],
    remaining: [],
    missingValidation: [NO_DEVICE],
    validation: V_DONE,
  },
  {
    phase: 7,
    label: 'Données temporelles',
    objective: 'Soleil, lune, heures et timeline.',
    status: 'done',
    delivered: ['Soleil et lune', 'Timeline synchronisée'],
    remaining: [],
    missingValidation: [NO_DEVICE],
    validation: V_DONE,
  },
  {
    phase: 8,
    label: 'Moteur d’analyse',
    objective: 'Facteurs d’habitat et de conditions, déterministes.',
    status: 'done',
    delivered: ['Potentiel par cellule', 'Facteurs et données manquantes visibles'],
    remaining: [],
    missingValidation: [
      'Le score n’est pas une probabilité de présence ; non validé contre le terrain.',
    ],
    validation: V_DONE,
  },
  {
    phase: 9,
    label: 'Carte d’analyse',
    objective: 'Afficher l’analyse sur la carte.',
    status: 'done',
    delivered: ['Carte de potentiel', 'Fiche de cellule'],
    remaining: [],
    missingValidation: [NO_DEVICE],
    validation: V_DONE,
  },
  {
    phase: 10,
    label: 'Graphiques avancés',
    objective: 'Graphiques et comparaisons.',
    status: 'done',
    delivered: ['Graphiques', 'Comparateur de caches'],
    remaining: [],
    missingValidation: [NO_DEVICE],
    validation: V_DONE,
  },
  {
    phase: 11,
    label: 'Mode terrain',
    objective: 'Interface simplifiée, gros boutons, une main.',
    status: 'done',
    delivered: ['Mode terrain', 'Guidage et boussole', 'Mode immersif'],
    remaining: [],
    missingValidation: ['Boussole et orientation réelles : non essayées.', NO_DEVICE],
    validation: V_DONE,
  },
  {
    phase: 12,
    label: 'Caméra',
    objective: 'Photo dans l’application, original conservé.',
    status: 'done',
    delivered: [
      'Caméra intégrée, original conservé',
      'Aide visuelle sang (expérimentale)',
    ],
    remaining: [],
    missingValidation: [
      'Caméra, lampe et vibration réelles : non essayées. L’aide visuelle n’a été testée que sur des images synthétiques.',
    ],
    validation: V_DONE,
  },
  {
    phase: 13,
    label: 'Journal',
    objective: 'Observations avec photos, position et conditions.',
    status: 'partial',
    delivered: [
      'Journal et observations',
      'DeerTracker (suivi de mes observations de cerfs)',
      '« + Repère » : repère normal, sang / indice, observation cerf ou orignal, caméra sang, position GPS ou choisie sur la carte, appui long',
      '« Après le tir » (cerf, orignal) : tir, indices, reprise de recherche, caméra sang, chronologie, carte et photos consignés par l’utilisateur',
    ],
    remaining: [
      '« Après le tir » : guide expert (conseils de recherche) à rédiger avec des sources vérifiables ; aucun conseil, diagnostic de blessure ni délai n’est donné pour l’instant',
    ],
    missingValidation: [NO_DEVICE],
    validation: {
      implemented: 'partial',
      automated: 'yes',
      browser: 'partial',
      device: 'no',
    },
  },
  {
    phase: 14,
    label: 'IA et assistant',
    objective: 'Résumer, expliquer et rechercher dans mes données.',
    status: 'partial',
    delivered: [
      'Fonctions déterministes : expliquer une cellule, comparer des caches, résumer un territoire, rechercher l’historique, comparer deux périodes',
      'Cadre pour un futur fournisseur d’IA (fournisseur nul)',
    ],
    remaining: [
      'IA générative : serveur sécurisé avec clé côté serveur, authentification, limites de débit, choix du fournisseur et du coût, consentement',
    ],
    missingValidation: ['L’IA générative n’est PAS activée : aucun réseau, aucune clé.'],
    validation: {
      implemented: 'partial',
      automated: 'yes',
      browser: 'partial',
      device: 'no',
    },
  },
  {
    phase: 15,
    label: 'Synchronisation',
    objective: 'Retrouver ses données sur plusieurs appareils.',
    status: 'partial',
    delivered: [
      'Sauvegarde et restauration en fichier ZIP',
      'Export et import GPX',
      'Tout reste sur l’appareil (aucun serveur, aucun compte)',
    ],
    remaining: ['Moteur de synchronisation, cloud, conflits entre appareils, comptes'],
    missingValidation: ['La synchronisation entre appareils n’existe pas.', NO_DEVICE],
    validation: {
      implemented: 'partial',
      automated: 'yes',
      browser: 'partial',
      device: 'no',
    },
  },
  {
    phase: 16,
    label: 'Tests et optimisation',
    objective: 'Fiabilité et performance sur appareils réels.',
    status: 'partial',
    delivered: [
      'Vitest, ESLint, TypeScript strict',
      'CI sur chaque PR',
      'E2E Chromium (services simulés)',
    ],
    remaining: [
      'Essais iPhone, Android, tablette',
      'Mesures de batterie, mémoire, réseau, fluidité',
    ],
    missingValidation: ['Aucune validation sur appareil réel ni mesure de performance.'],
    validation: {
      implemented: 'partial',
      automated: 'yes',
      browser: 'partial',
      device: 'no',
    },
  },
  {
    phase: 17,
    label: 'Version commerciale (finition produit)',
    objective: 'Produit fini : identité, installation, comptes éventuels.',
    status: 'partial',
    delivered: [
      'Accueil terrain, présentation, aide, confidentialité, à propos',
      'Installation PWA',
      'Refonte visuelle et navigation',
    ],
    remaining: [
      'Comptes, abonnement, paiement',
      'Identité visuelle finale',
      'Essais d’installation sur appareils réels',
    ],
    missingValidation: ['Installation PWA sur iPhone : non essayée.'],
    validation: {
      implemented: 'partial',
      automated: 'yes',
      browser: 'partial',
      device: 'no',
    },
  },
]

/**
 * Priorités de travail PROPOSÉES, tirées des manques ci-dessus (pas un
 * engagement de calendrier). À ajuster par le propriétaire du projet.
 */
export const PRIORITIES: readonly PriorityItem[] = [
  {
    level: 'P1',
    title: 'Valider sur iPhone réel',
    why: 'Tout ce qui est « livré » n’a été essayé que par des tests automatisés et un navigateur de bureau avec services simulés ; GPS, boussole, caméra, mode avion et installation PWA restent à vérifier sur le terrain.',
    phases: [16, 17],
  },
  {
    level: 'P1',
    title: 'Vérifier une vraie zone hors ligne',
    why: 'Le hors ligne protège l’usage en forêt sans réseau ; la logique est testée, pas une zone réellement téléchargée puis rechargée.',
    phases: [3, 16],
  },
  {
    level: 'P2',
    title: 'Synchronisation entre appareils',
    why: 'Utile, mais elle demande un serveur et des comptes (coût et sécurité à décider) ; la sauvegarde ZIP protège déjà les données.',
    phases: [15],
  },
  {
    level: 'P2',
    title: 'IA générative',
    why: 'Les résumés déterministes couvrent déjà l’essentiel ; l’IA générative exige une clé côté serveur, des limites et un consentement.',
    phases: [14],
  },
  {
    level: 'P2',
    title: 'Comptes, abonnement et identité visuelle finale',
    why: 'Aucune fonction actuelle n’en dépend ; à décider avec le modèle commercial.',
    phases: [17],
  },
]

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  todo: 'À faire',
  'in-progress': 'En cours',
  partial: 'Partiellement livrée',
  done: 'Terminée',
}

export const VALIDATION_LABEL: Record<keyof PhaseValidation, string> = {
  implemented: 'Implémenté',
  automated: 'Tests automatisés',
  browser: 'Validation navigateur (services simulés)',
  device: 'Validation appareil réel',
}

export const VALIDATION_STATE_LABEL: Record<ValidationState, string> = {
  yes: 'Oui',
  partial: 'Partielle',
  no: 'Non',
}

/** Chiffres de la carte d'accueil, calculés (jamais saisis à la main). */
export function roadmapSummary(phases: readonly RoadmapPhase[] = ROADMAP) {
  const count = (status: PhaseStatus) => phases.filter((p) => p.status === status).length
  return {
    total: phases.length,
    done: count('done'),
    partial: count('partial'),
    inProgress: count('in-progress'),
    todo: count('todo'),
  }
}
