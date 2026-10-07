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
- `startup-layer.spec.ts` : fond hybride au lancement à froid, fond conservé pendant la session, ancienne préférence sans effet, repli explicite (style 403, y compris avec un style déjà en cache).
- `offline.spec.ts` : démarrage à froid sans réseau (shell, moteur, contenu carte).
- `offline-download.spec.ts` : téléchargement de zone avec échecs de tuiles simulés → « incomplète » avec les compteurs, puis « Réessayer » (depuis la carte, et depuis Réglages) → « complète ».
- `csp.spec.ts` : politique CSP effective, avec contrôle négatif.
- `tracks.spec.ts` : trace interrompue récupérée après rechargement.
- `waypoints.spec.ts` : brouillon, annulation, enregistrement, verrouillage de la position.
- `coordinates.spec.ts` : coordonnées en grand, copie (réussie / refusée), marqueur sélectionné, états du GPS.
- `share.spec.ts` : partage natif (réussi, annulé, en échec, absent), repli par copie, contenu exclu.
- `shared-link.spec.ts` : ouverture à froid d'un lien `?p=lat,lng&n=nom` sous `/CTR-HUNTING/`, lien invalide, tentative d'injection, aucun enregistrement automatique.
- `guidance.spec.ts` : « Aller à » (distance, relèvement, ligne, mise à jour, arrêt), GPS refusé / ancien, hors ligne, aucune trace créée, coexistence avec un suivi explicitement démarré, mise en page aux 7 tailles et rotation.
- `screenshots-panels.spec.ts` : captures des nouveaux panneaux (uniquement avec `E2E_SCREENSHOTS=1`).

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
- Le téléchargement **balaie la caméra** sur la zone cadrée (la carte « saute »
  de position en position, puis revient à la vue d'origine) et met en cache les
  tuiles que le moteur demande pendant ce balayage : celles du **fond actif**
  et des couches visibles à ce moment (relief 3D compris, la météo n'est jamais
  mise en cache). Les niveaux affichés sont des niveaux de zoom **de la carte**,
  pas de la grille de tuiles du fournisseur.
- **Aucune erreur n'est ignorée.** Chaque requête (tuile, style, sprite, glyphes)
  est comptée : réussie, déjà en cache, échouée ou absente chez le fournisseur
  (404/204). Jusqu'à 3 tentatives par requête (délai de 15 s chacune). Une
  position du balayage qui n'atteint pas l'état « inactif » est reprise une
  fois, puis comptée comme dépassée.
- **Quatre états distincts** : _Terminée_ (toutes les requêtes ont réussi, toutes
  les positions du balayage ont abouti), _Incomplète_ (terminée avec des échecs
  ou des positions dépassées), _Interrompue_ (annulée, ou app fermée pendant le
  téléchargement) et _Échec_ (n'a pas pu démarrer). Le libellé « prête hors
  ligne » n'est jamais affiché sans l'état _Terminée_. D'anciennes zones
  enregistrées avant ce changement sont étiquetées « Terminée (ancienne
  version, non vérifiée) ».
- **Pas de pourcentage de couverture géographique.** L'app affiche la
  progression des **requêtes** (« 42 réussies · 3 échecs ») ; elle ne peut pas
  garantir la couverture tuile par tuile. _Terminée_ veut dire « tout ce que le
  balayage a demandé a été reçu », rien de plus.
- **« Réessayer le téléchargement »** reprend une zone incomplète, interrompue
  ou en échec : les tuiles déjà reçues sont réutilisées, seules les manquantes
  sont redemandées. Annuler ou échouer ne supprime jamais les tuiles déjà en
  cache.
- **Depuis Réglages**, « Réessayer » (zones incomplètes, interrompues ou en
  échec) ouvre la page Carte puis appelle la même fonction de reprise. Le fond
  de carte affiché doit être celui de la zone ; sinon un message l'indique et
  rien n'est téléchargé.
- Le cache d'un style n'est servi qu'après une **panne réseau** (hors ligne,
  délai dépassé, 5xx). Une réponse 401/403/404 du fournisseur n'est pas masquée
  par la copie en cache : le repli explicite vers le fond suivant se déclenche.
- Un test réel de couverture reste nécessaire : l'étape 7 ci-dessous (ouvrir
  hors ligne et regarder la carte) est la seule vraie preuve.

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

## Trois sortes de validation, à ne pas confondre

| Sorte                                   | Ce qu'elle couvre                                                                                                                                           | État                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **A. Simulée** (tests unitaires et E2E) | Logique, calculs, mise en page, cache, flux d'écran, avec GPS, boussole, presse-papiers, partage natif et fournisseur cartographique **simulés** (Chromium) | Exécutée : voir le rapport de la PR                                  |
| **B. Services cartographiques réels**   | Vraies clés MapTiler/Esri, vraies tuiles, quotas, restrictions de domaine                                                                                   | **Non exécutée** (pas de clé ni de réseau vers les fournisseurs ici) |
| **C. iPhone physique, PWA installée**   | Boussole réelle, GPS réel, partage iOS, presse-papiers iOS, mode avion, zone téléchargée, mise en veille                                                    | **Non exécutée** : checklist ci-dessous                              |

Une réussite de la sorte A n'est jamais une validation de B ou de C. En
particulier, **la boussole physique et le partage iOS ne sont pas validés** par
les tests : ils utilisent des événements d'orientation, un `navigator.share` et
un presse-papiers fabriqués.

## Coordonnées, partage, guidage : comportement exact

- **Position du waypoint** = coordonnées sauvegardées et verrouillées, affichées
  en grand (Latitude / Longitude, N/S et E/O, 5 décimales). Les décimales
  affichées ne sont pas une preuve de précision GPS ; la valeur stockée n'est
  jamais arrondie.
- **Ma position** = dernière position GPS du navigateur, avec précision (±m),
  âge du relevé et état : recherche, disponible, ancien (> 15 s), très ancien
  (> 120 s, plus de distance ni de direction), refusé, indisponible. Sans
  position GPS, rien n'est remplacé par le centre de la carte.
- **Copie** : « Coordonnées copiées » n'apparaît que si la copie a réellement
  réussi ; sinon un message le dit.
- **Partage** : nom, latitude, longitude, lien cartographique (Google Maps URLs
  API) et lien vers l'app. Jamais de photos, notes, historique, autres points ni
  position de l'utilisateur. Annuler le partage n'est pas une erreur. Sans
  partage natif : « Copier le texte / lien ». « Partager ma position » envoie un
  **instantané**, pas un suivi.
- **Lien partagé** : le lien pointe vers la racine de l'app
  (`/CTR-HUNTING/?p=lat,lng&n=nom`) parce que GitHub Pages n'a pas de repli SPA
  (un lien profond renverrait une 404 à un destinataire sans l'app installée).
  Les coordonnées sont validées strictement, le nom est nettoyé et affiché
  comme texte seulement ; le point est un aperçu, **jamais enregistré
  automatiquement** et n'écrase aucun waypoint.
- **Aller à** : guidage **à vol d'oiseau** (« pas un itinéraire routier ou un
  sentier sécurisé »). Distance (haversine) et relèvement vrai depuis la
  dernière position GPS ; aucune estimation de durée, aucune instruction de
  virage, aucun droit de passage. Le waypoint n'est jamais modifié et aucune
  trace n'est créée ; le suivi GPS (« Enregistrer une trace ») reste une
  fonction distincte qui peut tourner en même temps.
- **Cap du téléphone** : seul un capteur **absolu** est utilisé ; un capteur
  relatif est ignoré. Le cap est magnétique ; il est converti en nord vrai par
  la déclinaison du modèle NOAA WMM2025 (paquet `geomagnetism` 0.2.0, hors
  ligne, valide de 2024-11 à 2029-11 ; ≈ −14,8° à Québec). La flèche relative
  n'apparaît que si un cap vrai fiable existe ; sinon le panneau donne le
  relèvement en degrés. La **direction de déplacement GPS** n'est jamais
  présentée comme le cap du téléphone.
- **Proximité** : à moins de max(précision GPS, 10 m), aucune flèche et aucun
  « Arrivé » : le panneau explique que la précision du GPS ne permet pas d'être
  plus précis.
- **Hors ligne** : distance et direction sont calculées localement (coordonnées
  du waypoint + GPS). Le fond de carte dépend des tuiles réellement
  téléchargées.
- **Limites** : précision du GPS (quelques mètres en terrain dégagé, davantage
  sous couvert), interférences magnétiques et calibration de la boussole,
  aucune garantie d'accès au terrain.

## Checklist iPhone (physique, PWA installée) — NON exécutée ici

1. Carte et boutons visibles et utilisables en portrait et en paysage.
2. Mode immersif : entrée, puis sortie visible.
3. Lancement à froid : satellite hybride.
4. Fiche d'un waypoint : coordonnées grandes et lisibles, Latitude/Longitude claires.
5. « Copier les coordonnées » : coller dans Notes ; la confirmation n'apparaît que si le collage fonctionne.
6. « Partager ce point » : la feuille de partage iOS s'ouvre ; annuler ne montre aucune erreur ; le texte contient nom, coordonnées, lien.
7. « Partager ma position » : explique « instantané » ; rien n'est envoyé avant ton choix.
8. Ouvrir le lien partagé sur un autre appareil : point affiché sans être enregistré.
9. Waypoint verrouillé après « Enregistrer » (pas de déplacement possible).
10. « Aller à » : la distance et la direction changent quand tu marches ; « Activer la boussole » demande bien la permission ; la flèche tourne dans le bon sens quand tu tournes le téléphone ; vérifier **portrait et paysage** (le sens de la correction d'écran n'a pas pu être validé sans appareil) ; comparer le cap avec une boussole connue (écart attendu < 10–15°, calibrer en « 8 » si besoin).
11. « Arrêter le guidage » ; guidage + enregistrement d'une trace en même temps.
12. Trace récupérable après fermeture complète de l'app.
13. Zone téléchargée puis rechargement à froid en mode avion (procédure plus haut).
14. Guidage hors ligne vers un waypoint local en mode avion.
