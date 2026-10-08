/**
 * Pages reachable from Réglages, the home page and in-app links, but kept out
 * of the navigation bars (`navigation.ts`). They only need a title for the
 * mobile top bar.
 */
export const secondaryPages: readonly { path: string; label: string }[] = [
  { path: '/help', label: 'Aide' },
  { path: '/privacy', label: 'Confidentialité' },
  { path: '/about', label: 'À propos' },
]
