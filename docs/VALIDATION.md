# Validation : ce qui est réellement testé, et ce qui ne l'est pas

Ce document dit honnêtement ce que prouvent les tests automatisés de la
branche `fix/audit-mobile-offline-gps`. Aucun test ci-dessous n'est une
validation sur un vrai iPhone.

## Versions de Node réellement utilisées

- **Première série de validation** (rapport initial de la PR) : Node **22.22.0**,
  alors que le projet cible Node 24 (`.nvmrc`). Le rapport l'a signalé trop tard.
- **Série finale** (typecheck, lint, 520 tests unitaires, build, `npm audit`, 21
  E2E) : Node **24.21.0**, exécutée localement dans l'environnement de travail.
- **GitHub Actions** : le workflow lit `.nvmrc` (24). Les exécutions du commit
  `12886b5` sont « success » (jobs `validate` et `e2e`), constaté par l'API
  GitHub. Les journaux ne sont pas téléchargeables depuis l'environnement de
  travail : la version exacte de Node utilisée par Actions n'a donc **pas** été
  lue. Le résultat de la CI sur les commits ajoutés ensuite est à relire dans
  l'onglet « Checks » de la PR.

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

## Hors ligne : quatre choses distinctes

Une simple première visite **ne prouve pas** qu'une zone est téléchargée.
Quatre niveaux différents, chacun avec sa preuve :

| Niveau                        | Ce que c'est                                                                      | Comment il arrive sur l'appareil                                             | Ce que prouve un test automatisé                                                  | Ce qui n'est PAS prouvé                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. Shell                      | HTML, JS, CSS de l'app                                                            | Service worker (précache) à la 1re visite                                    | `offline.spec.ts` étape 1 : rechargement sans réseau                              | Comportement du service worker sous Safari/iOS                                                |
| 2. Moteur                     | Worker MapLibre (`maplibre-gl-worker.mjs`)                                        | Précache du service worker                                                   | `offline.spec.ts` étape 2 : worker présent dans le cache, aucune requête en échec | Idem, et WebGL sur l'iPhone réel                                                              |
| 3. Styles et ressources       | JSON de style, sprites, glyphes **du fond déjà affiché**                          | Mis en cache **au fil de l'usage en ligne** (`ctrfresh://`, `ctrstatic://`)  | `offline.spec.ts` étape 3 avec ressources simulées                                | Que les vraies ressources MapTiler/Esri se mettent en cache (formats, en-têtes, quotas réels) |
| 4. Tuiles de la zone préparée | Tuiles raster du fond actif, pour la zone affichée et les niveaux de zoom choisis | **Uniquement** via « Télécharger cette zone hors ligne » (outil de la carte) | Logique de téléchargement et de cache testée en unitaire                          | **Aucun E2E ne télécharge une vraie zone** : les tuiles E2E sont des images unies fabriquées  |

Conséquences :

- Après une première visite seule, on a les niveaux 1 et 2, et du niveau 3
  seulement pour ce qui a été affiché. **Hors de la zone regardée, ou à un autre
  zoom, la carte sera vide hors ligne.**
- Seul le niveau 4 garantit des tuiles sur une zone. Il est propre à **un fond
  de carte** (celui actif au moment du téléchargement) : une zone téléchargée en
  « Imagerie hybride » n'existe pas pour « Satellite ».
- Le téléchargement balaie la caméra sur la zone (la carte « saute » de tuile en
  tuile, puis revient à la vue d'origine) et met en cache **les tuiles que le
  moteur demande pendant ce balayage** : le fond actif, mais aussi les couches
  visibles à ce moment-là. Le nombre « tuiles » affiché à la fin est celui des
  tuiles réellement reçues, pas l'estimation de départ ; les deux peuvent
  différer. Une tuile qui ne répond pas dans les 5 s est sautée sans message :
  **la fin du téléchargement ne garantit donc pas une couverture complète.**
  C'est pour cela que l'étape 7 ci-dessous (ouvrir hors ligne et regarder la
  carte) est la seule vraie preuve.

### Tester une vraie zone hors ligne sur l'iPhone

À faire sur le site installé (Safari → Partager → « Sur l'écran d'accueil »),
**en Wi-Fi**, avec les vraies clés configurées sur le déploiement testé.

1. Ouvrir l'app installée en ligne. Laisser la carte s'afficher en « Imagerie hybride ».
2. Se placer sur la zone voulue et choisir le zoom de départ (zoom plus large = plus de tuiles).
3. Outils → « Télécharger cette zone hors ligne ». Régler les « niveaux de zoom supplémentaires » (0 à 3). Noter le nombre de tuiles annoncé.
4. « Lancer le téléchargement » et attendre la fin **sans quitter l'app** (iOS suspend les pages en arrière-plan). Le compteur de tuiles doit s'arrêter ; aucun message d'échec.
5. Réglages → zones hors ligne : vérifier la zone, le nombre de tuiles, la taille et la plage de zoom, sans mention « Échec » ni « Annulé ».
6. Fermer l'app complètement (balayer pour la fermer), puis **couper le réseau** : mode avion, Wi-Fi coupé.
7. Rouvrir l'app installée : la carte doit s'afficher dans la zone, aux zooms téléchargés, avec le bandeau « Hors ligne ».
8. Vérifier aussi : zoomer **au-delà** du zoom maximal téléchargé et **sortir** de la zone → vide attendu. Ce n'est pas un bogue, c'est la limite du téléchargement.
9. Changer de fond (Satellite) : il doit rester vide hors ligne si ce fond n'a pas été téléchargé non plus.
10. Remettre le réseau, rouvrir : la carte se recharge normalement.

Limites iOS à connaître : Safari peut vider le stockage d'un site non installé
après une période d'inactivité ; une app installée est mieux protégée mais pas
garantie. Les points de repère et les traces sont dans IndexedDB, non dans le
cache des tuiles.

### Limites des tests utilisant des services simulés

- Les E2E répondent à la place de MapTiler et d'Esri avec des fixtures. Ils
  prouvent la logique de cache de l'application, pas la disponibilité réelle,
  les clés, les quotas ni les conditions d'utilisation des fournisseurs.
- Aucun test n'a téléchargé de vraie zone, ni vérifié le volume réel de
  stockage, ni testé un manque d'espace.
- Chromium seulement : le comportement du cache et du service worker sous
  WebKit/iOS n'est pas couvert.
