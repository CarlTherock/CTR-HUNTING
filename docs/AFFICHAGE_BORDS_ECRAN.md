# Bords de l'écran : zones sûres, mode immersif, diagnostic d'affichage

> Validation : Chromium avec zones sûres d'iPhone **émulées** (47/34 px en portrait,
> 47 latérales + 21 en paysage), carte et prévisions **simulées**. WebKit n'est pas
> disponible ici et **aucun iPhone réel n'a été testé**.

## Historique réel (Git)

| Commit            | Changement                                                                                                                                        | Portée                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `ee21556`         | Coque `h-dvh`, barres haut/bas **dans le flux** qui appliquent chacune leur zone sûre une fois. Mode immersif : la **coque** ajoutait 47 + 34 px. | Toute l'application    |
| PR 19 (`3a31b66`) | Caméra de sang : dialogue `fixed inset-0`, zone sûre appliquée une fois sur le dialogue.                                                          | Caméra seulement       |
| PR 21 (`f19d7c3`) | Navigation masquée pendant l'analyse du vent ; feuille jusqu'au bas, zone sûre dans la feuille — **hors immersif seulement**.                     | Vent, hors immersif    |
| cette PR          | Immersif : plus de marge sur la coque ; la carte couvre tout le viewport, seules les **commandes** sont dans les zones sûres.                     | Immersif (carte, vent) |

Rien n'avait été écrasé. L'erreur de la PR 21 : « en immersif la coque l'applique déjà »
— vrai, mais cela laissait une bande noire sous la carte et sous la feuille.

## Mesures avant correction (390 × 844, zones sûres 47/34)

| État            | Bas de l'écran                         | Bande                                   |
| --------------- | -------------------------------------- | --------------------------------------- |
| Normal          | navigation 91 px = 56 + 34 (zone sûre) | couleur de la barre, pas la coque       |
| Vent ouvert     | feuille jusqu'à 844                    | aucune                                  |
| Immersif        | carte de 47 à 810                      | **47 px en haut, 34 px en bas** (coque) |
| Immersif + vent | feuille s'arrête à 810                 | **34 px noirs sous la feuille**         |

## Correction

- `AppShell` : aucune marge de zone sûre en immersif.
- `MapPage` : le bloc des commandes est inséré des zones sûres (marges `env()`), la
  boîte de la carte en ressort des mêmes valeurs (insets négatifs) : l'image couvre
  tout le viewport, les commandes (rail, badges, dock, bouton « Quitter ») restent
  dans les zones sûres. Une seule réserve, jamais deux.
- MapLibre : ses contrôles de coin (boussole, attributions) reçoivent la même marge en
  `padding` (`[data-map-bleed]` dans `index.css`), cumulée avec `--sheet-height`.
- Feuille de vent : en immersif, ses commandes s'arrêtent à la ligne sûre (pas de
  `padding` en plus) et son **fond** est prolongé jusqu'au bord par `::after`
  (hauteur = zone sûre basse, le cadre et `--sheet-height` ne changent pas).
- Le bouton « Quitter le mode immersif » n'est plus masqué pendant l'analyse du vent (il l'était comme outil secondaire) : testé dans l'état 4.
- Navigation normale et feuille hors immersif : **inchangées** (aucun défaut confirmé).

Tests : `e2e/immersive-bords.spec.ts` (4 états × portrait/paysage, captures
`docs/validation/bords-*.png`), `e2e/immersive.spec.ts` (la carte couvre le viewport et
**les commandes** sont dans les zones sûres — l'ancienne version imposait que toute la
carte y reste).

## Diagnostic d'affichage (À propos)

Section « Diagnostic d'affichage », **à la demande** (rien n'est mesuré avant l'appui)
et **copiable** : version, date et heure de compilation avec fuseau (affichage local

- ISO UTC), `innerHeight`, `screen.height`, `visualViewport` (hauteur, `offsetTop`),
  zones sûres haut/bas/côtés (mesurées par une sonde invisible `env()`), rectangles de
  la coque, de la zone principale, de la navigation et de la dernière mesure de la
  carte, mode standalone ou navigateur. Aucune position, aucune clé, aucun repère ;
  aucun envoi : l'utilisateur copie le texte.

Pour lire la carte, l'ouvrir d'abord (la page À propos ne la contient pas), puis
revenir. Lecture rapide : « Écart bas du viewport − bas de la navigation » vaut 0 si
rien ne dépasse sous la barre.

## Limites

- iPhone réel et WebKit non testés : le comportement de `100dvh`, de la barre Safari
  et de l'application installée reste à confirmer avec le diagnostic ci-dessus.
- Paysage : les marges latérales de 47 px laissent voir la carte de chaque côté de la
  feuille de vent (le fond n'est prolongé que vers le bas).
- Les fenêtres `fixed` (profil d'élévation, hors ligne…) gardent leur propre calcul de
  zone sûre, inchangé.
