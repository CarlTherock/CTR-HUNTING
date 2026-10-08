export type PhaseStatus = 'done' | 'partial' | 'not-started'

export interface RoadmapPhase {
  phase: number
  label: string
  status: PhaseStatus
  /** Honest one-line qualification, shown for non-finished phases. */
  note?: string
}

/**
 * Concise mirror of `docs/ROADMAP_STATUS.md` and the phase table of
 * `PROJECT_SPECIFICATION.md`. Those files are the reference; update all three
 * together. Phases 14 to 17 are NOT marked finished.
 */
export const ROADMAP: readonly RoadmapPhase[] = [
  { phase: 0, label: 'Fondations', status: 'done' },
  { phase: 1, label: 'Carte', status: 'done' },
  { phase: 2, label: 'Points de repère et traces', status: 'done' },
  { phase: 3, label: 'Hors ligne', status: 'done' },
  { phase: 4, label: 'Terrain 3D', status: 'done' },
  { phase: 5, label: 'Météo', status: 'done' },
  { phase: 6, label: 'Vent', status: 'done' },
  { phase: 7, label: 'Données temporelles', status: 'done' },
  { phase: 8, label: 'Moteur d’analyse', status: 'done' },
  { phase: 9, label: 'Carte d’analyse', status: 'done' },
  { phase: 10, label: 'Graphiques avancés', status: 'done' },
  { phase: 11, label: 'Mode terrain', status: 'done' },
  { phase: 12, label: 'Caméra', status: 'done' },
  { phase: 13, label: 'Journal', status: 'done' },
  {
    phase: 14,
    label: 'IA et assistant',
    status: 'not-started',
    note: 'Non commencée dans cette version.',
  },
  {
    phase: 15,
    label: 'Synchronisation',
    status: 'partial',
    note: 'Sauvegarde et restauration en fichier, export/import GPX. La synchronisation entre appareils n’existe pas (aucun serveur, aucun compte).',
  },
  {
    phase: 16,
    label: 'Tests et optimisation',
    status: 'partial',
    note: 'Tests automatisés et E2E sous Chromium. Pas de validation sur iPhone, Android ou tablette réels, ni de mesures de batterie, mémoire ou fluidité.',
  },
  {
    phase: 17,
    label: 'Version commerciale (finition produit)',
    status: 'partial',
    note: 'Livré : accueil terrain, présentation, aide, confidentialité, à propos. Reporté : comptes, abonnement, paiement, identité visuelle finale, essais d’installation sur appareils réels.',
  },
]

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  done: 'Livrée',
  partial: 'Partielle',
  'not-started': 'Non commencée',
}
