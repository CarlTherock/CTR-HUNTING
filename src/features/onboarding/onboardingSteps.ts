import type { LucideIcon } from 'lucide-react'
import { Compass, DatabaseBackup, ShieldCheck, LocateFixed } from 'lucide-react'

export interface Step {
  icon: LucideIcon
  title: string
  body: string[]
}

/**
 * Four short screens. They only EXPLAIN: this component never asks the
 * browser for the position, the compass or the camera (tests spy on all
 * three). Each permission is requested later, when the function that needs it
 * is used.
 */
export const ONBOARDING_STEPS: readonly Step[] = [
  {
    icon: Compass,
    title: 'À quoi sert CTR Hunting',
    body: [
      'Une carte de terrain pour préparer et vivre une sortie : points de repère, traces, guidage « Aller à », boussole, météo et vent, soleil et lune, analyse du terrain et journal.',
      'Elle est conçue pour continuer à fonctionner sans réseau, une fois les cartes téléchargées.',
    ],
  },
  {
    icon: ShieldCheck,
    title: 'Vos données restent sur votre appareil',
    body: [
      'Vos points, traces, photos et notes sont enregistrés dans le stockage de cet appareil. Il n’y a ni compte, ni envoi de vos notes ou photos, ni statistiques d’usage.',
      'Le réseau sert seulement à charger les cartes, la météo et quelques couches de données : la page Confidentialité détaille ce qui est envoyé.',
    ],
  },
  {
    icon: DatabaseBackup,
    title: 'Pensez à sauvegarder',
    body: [
      'Comme tout est local, vider les données du site (ou une libération d’espace par le téléphone) efface vos données.',
      'Dans Réglages, « Données et sauvegarde » crée un fichier à garder ailleurs (iCloud, ordinateur…). Un rappel discret vous le suggère.',
    ],
  },
  {
    icon: LocateFixed,
    title: 'Les permissions : au moment utile',
    body: [
      'Rien n’est demandé maintenant. Votre navigateur vous demandera la position quand vous ouvrirez une page qui l’utilise (carte, météo…), la caméra quand vous l’ouvrirez, et la boussole (iPhone) quand vous toucherez le bouton prévu.',
      'Vous pouvez refuser : l’application reste utilisable, sans la fonction concernée. L’aide explique les limites du GPS sur iPhone.',
    ],
  },
]
