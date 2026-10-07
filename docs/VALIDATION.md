# Validation : ce qui est réellement testé, et ce qui ne l'est pas

Ce document dit honnêtement ce que prouvent les tests automatisés de la
branche `fix/audit-mobile-offline-gps`. Aucun test ci-dessous n'est une
validation sur un vrai iPhone.

## Ce qui est exécuté

| Niveau                 | Outil                                                          | Environnement           |
| ---------------------- | -------------------------------------------------------------- | ----------------------- |
| Types                  | `npx tsc -b`                                                   | Node 24                 |
| Lint                   | `npx eslint .`                                                 | Node 24                 |
| Unitaires / composants | `npx vitest run`                                               | jsdom                   |
| E2E                    | `npm run e2e` (Playwright, build de production servi en local) | **Chromium uniquement** |
| Dépendances            | `npm audit --omit=dev --audit-level=high`                      | registre npm            |

## Limites assumées des E2E

- **Fournisseur cartographique simulé** (`e2e/support/mockMapBackend.ts`) :
  style, sprites, glyphes et tuiles sont des réponses fabriquées de couleur
  unie par couche. Cela prouve la logique de cache et d'affichage de
  l'application, pas que les tuiles MapTiler/Esri d'une vraie région
  s'affichent ou se téléchargent.
- **Position GPS simulée** (surcharge de géolocalisation Playwright) : prouve
  la persistance et la reprise des traces, pas la précision GPS d'un iPhone.
- **Zones de sécurité iPhone émulées** (insets injectés via CDP) : prouve que
  la mise en page les respecte, pas le rendu réel de Safari (barre d'URL
  dynamique, encoche, mode installé).
- **WebKit/Safari non testé** : le moteur WebKit n'est pas disponible dans cet
  environnement. Aucune assertion n'a été exécutée sous Safari ni sous iOS.
- **Site déployé non testé** : le domaine github.io n'est pas joignable depuis
  l'environnement de travail.
- **GitHub Actions, Pages, protection de branche, restrictions de clés dans
  les consoles des fournisseurs** : non vérifiés ici.

## Tailles d'écran couvertes (Chromium, E2E `layout.spec.ts`)

320×568, 375×812, 390×844, 430×932, 844×390 (paysage), 768×1024, 1440×900.
Pour chaque taille : pas de défilement de la page, canvas = conteneur,
contrôles visibles et non masqués, cibles tactiles ≥ 44 px (écrans tactiles).

## Parcours E2E

- `layout.spec.ts` : mise en page carte aux 7 tailles.
- `immersive.spec.ts` : mode plein écran de la carte.
- `startup-layer.spec.ts` : ouverture sur la vue satellite hybride (pixels du canvas).
- `offline.spec.ts` : démarrage à froid sans réseau (shell, moteur, contenu carte).
- `csp.spec.ts` : politique CSP effective, avec contrôle négatif.
- `tracks.spec.ts` : trace interrompue récupérée après rechargement.
- `waypoints.spec.ts` : brouillon, annulation, enregistrement, verrouillage de la position.

## Régénérer les captures « après »

`E2E_SCREENSHOTS=1 npm run e2e -- e2e/layout.spec.ts` réécrit
`docs/validation/apres-*.png`.
