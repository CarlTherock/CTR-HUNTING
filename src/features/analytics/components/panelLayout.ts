/**
 * Mise en page commune du panneau de réglages et de la fiche de cellule.
 *
 * - Portrait / grand écran : panneau en bas, centré, `max-w-sm`.
 * - Paysage court (hauteur ≤ 480 px, ex. 568×320 ou 844×390) : colonne à
 *   gauche sur toute la hauteur, pour laisser la carte visible et
 *   touchable à droite au lieu de la recouvrir.
 * - Marges de zone sûre (encoche, barre d'accueil) sur les quatre côtés.
 * - Le contenu défile À L'INTÉRIEUR du panneau (jamais la page).
 */
export const PANEL_WRAPPER =
  'fixed inset-x-0 bottom-0 z-30 flex justify-center pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] [@media(max-height:480px)]:inset-x-auto [@media(max-height:480px)]:inset-y-0 [@media(max-height:480px)]:left-0 [@media(max-height:480px)]:w-[min(24rem,62vw)] [@media(max-height:480px)]:items-stretch [@media(max-height:480px)]:justify-start [@media(max-height:480px)]:pr-2 [@media(max-height:480px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none'

export const PANEL_BOX =
  'pointer-events-auto w-full max-w-sm overflow-y-auto overscroll-contain rounded-lg border border-surface-600 shadow-2xl max-h-[min(82dvh,40rem)] [@media(max-height:480px)]:max-h-full [@media(max-height:480px)]:max-w-none'

/** Panneau de réglages : plus bas que la fiche, pour laisser une bande de
 * carte touchable au-dessus (on touche une cellule pour ouvrir sa fiche). */
export const PANEL_BOX_COMPACT = PANEL_BOX.replace(
  'max-h-[min(82dvh,40rem)]',
  'max-h-[min(55dvh,28rem)]',
)
