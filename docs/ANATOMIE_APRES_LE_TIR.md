# Module « Anatomie et point d'impact »

Écran `/after-shot/anatomie`. Version du contenu : `contenu-0.1.0` (révision 2026-10-08). Dessins : `cerf-profil-gauche-1`, `orignal-profil-gauche-1`.

## Objet et garde-fous

Le module reprend le **principe fonctionnel** décrit publiquement par DeerCast Track (choisir un point d'impact sur un modèle anatomique, consulter des informations de suivi). Il ne copie ni leurs textes, vidéos, illustrations, marque ou algorithme, et n'en fournit pas l'équivalent prédictif : l'algorithme et la banque de vidéos de DeerCast sont propriétaires et n'existent pas ici.

Le point est une **estimation manuelle**. Rien n'est calculé à partir de lui : ni diagnostic, ni probabilité de survie, ni distance de fuite, ni position de l'animal, ni délai d'attente, ni compte à rebours, ni banque de cas similaires, ni trajectoire de projectile.

## Sources consultées (8 octobre 2026)

Les huit pages ont été **accessibles** et lues en entier ; la lecture est passée par un résumeur, pas par du texte brut (les citations exactes n'ont pas été vérifiées mot à mot).

| Source                                      | Accès | Usage                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| deercast.com/features                       | oui   | Décrit le produit (point d'impact sur un modèle de cerf, algorithme et base propriétaires, vues 3D). **Aucune fiche ne la cite** : elle ne contient pas d'anatomie.                                                                                               |
| Aide Drury « What is DeerCast Track »       | oui   | Idem. Mentionne l'accès réservé à un compte Elite et aucun avertissement.                                                                                                                                                                                         |
| ADF&G Alaska, Big Game Shot Placement       | oui   | Seule source anatomique : zone cœur-poumons (orignal : la plus grande zone vitale, « taille d'un ballon de basket »), os d'épaule, tir de dos déconseillé. **Ne décrit pas** foie, panse, intestins, ni la conduite après le tir ; images sans crédit ni licence. |
| TPWD (Texas), After the Shot                | oui   | Repères avant le tir, réaction typique d'un tir de flanc, délai (non repris), recherche. Cerf.                                                                                                                                                                    |
| Hunter-Ed (N.-G. du Sud), Blood sign        | oui   | Indices de sang présentés comme des possibilités. Espèce non précisée.                                                                                                                                                                                            |
| Hunter-Ed (national), Trailing Wounded Game | oui   | Organisation de la recherche. Ne dit pas quand demander de l'aide.                                                                                                                                                                                                |
| HuntStand                                   | oui   | Conseils de pisteur ; délais chiffrés propres à la source (non repris).                                                                                                                                                                                           |
| MeatEater                                   | oui   | Réactions, indices, mises en garde ; délais chiffrés propres à la source (non repris).                                                                                                                                                                            |

Les sources sont étrangères : elles servent à l'anatomie et à la pédagogie, **pas** à définir une obligation québécoise.

## Inventaire du contenu

| Sujet                                                           | Publié ?                                                         | Pourquoi                                                                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Zone cœur-poumons (cerf, orignal)                               | Oui                                                              | ADF&G.                                                                                                                                                       |
| Épaule, arrière-train, dos, pattes, arrière des côtes / abdomen | Oui, avec contexte et incertitudes                               | ADF&G, MeatEater, HuntStand, Hunter-Ed.                                                                                                                      |
| Lecture du sang, organisation de la recherche                   | Oui (cerf ; orignal « non confirmé »)                            | Sources centrées sur le cerf.                                                                                                                                |
| Position du foie, de la panse, des intestins                    | **Non dessinée**                                                 | Citées sans position anatomique par les sources lues.                                                                                                        |
| Anatomie interne de l'orignal au-delà de cœur-poumons / épaule  | **Non publiée**                                                  | Aucune source lue.                                                                                                                                           |
| Délais d'attente chiffrés                                       | **Non publiés**                                                  | Les sources divergent (30 min–1 h, 4 h, 6–8 h… selon la source et l'impact). Revue spécialisée impossible. Seule la divergence est mentionnée, sans chiffre. |
| Aide spécialisée, réglementation québécoise                     | **Non publiées**                                                 | Aucune source lue ne le couvre ; sources officielles du Québec à vérifier (voir le guide « Après le tir », section « à venir »).                             |
| Têtes et cou                                                    | Cou : dans la fiche « Épaule » (MeatEater) ; tête : aucune fiche | Sources insuffisantes.                                                                                                                                       |

Une fiche n'est affichée que si chacune de ses sources existe avec titre, éditeur, URL https et date de consultation (`isSheetPublished`).

## Illustrations (provenance)

| Asset                                           | Origine                                                                                 | Licence                                            | Références anatomiques                      | Limites                                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `deer-lateral-left` v`cerf-profil-gauche-1`     | Dessin vectoriel écrit à la main pour le projet, sans calque                            | Création originale du projet ; aucun élément tiers | ADF&G (zone cœur-poumons derrière l'épaule) | Non relu par un anatomiste ; proportions approximatives ; seules la zone cœur-poumons et la colonne sont dessinées ; une vue |
| `moose-lateral-left` v`orignal-profil-gauche-1` | Dessin séparé (garrot, pattes longues, museau, fanon), pas une mise à l'échelle du cerf | Idem                                               | ADF&G (orignal)                             | Idem ; seule donnée de source : cœur-poumons et os d'épaule                                                                  |

Une illustration originale n'est pas pour autant exacte : la silhouette est un schéma d'orientation. Les dessins de DeerCast, Hunter-Ed, ADF&G ou autres éditeurs n'ont été ni copiés ni redessinés.

## Schéma de données

`Observation.shot.impact?: ImpactEstimate` (`src/types/observation.ts`) :

```
species        'deer' | 'moose'     dessin utilisé
view           'lateral-left'
x, y           0..1                 position normalisée sur l'illustration entière
regionId?      string               région contenant le point (ou choisie dans la liste)
presumed       true                 toujours une présomption de l'utilisateur
recordedAt     ISO 8601
illustrationVersion  string         version du dessin sur lequel x/y se rapportent
note?          string (≤ 500)
```

- Réutilise `Observation.shot` (pas de base parallèle).
- **Migration : aucune.** Champ optionnel dans un enregistrement Dexie sans index sur `shot` ; les tirs existants restent valides sans `impact` (testé).
- Sauvegarde ZIP : `validateObservation` vérifie l'espèce, la vue, `x`/`y` dans [0, 1], `presumed === true`, la date, la version ; test d'aller-retour et de rejet dans `backupDeer.test.ts`.
- Si un dessin change, sa version change ; un point enregistré sur une version précédente est affiché avec un avertissement, **jamais déplacé**.
- Retour arrière : « Retirer l'estimation du tir » supprime seulement `impact`, le reste du dossier est intact.

## Architecture (prête pour un modèle 3D, sans l'afficher)

`src/features/anatomy/` : `types.ts`, `anatomyLogic.ts` (zoom, conversion écran → coordonnées normalisées, région, enregistrement), `content/` (sources, fiches, publication, version), `illustrations/` (données par espèce), `components/` (dessin, panneau, fiche), `state/` (brouillon en mémoire : survit à la rotation et à un changement d'écran), `pages/AnatomyPage.tsx`. Un futur modèle 3D ajouterait une `view` et une illustration sans changer `ImpactEstimate`. Aucun bouton 3D n'est affiché.

## Ergonomie

- Gestes séparés : tap court = place le point ; glisser le dessin = déplacer (si zoomé) ; glisser la pastille = déplacer le point ; deux doigts = zoom. `touch-action: none` sur le dessin seulement.
- Alternative sans toucher : liste de régions ; flèches du clavier sur la pastille.
- Le panneau de résultats est **dans le flux** (il ne recouvre jamais le dessin) ; seul son bouton le replie ; « Enregistrer » reste dans son en-tête.
- Paysage court (≤ 480 px de haut) : deux colonnes (dessin à gauche, titre / espèce / panneau à droite) ; le panneau n'est alors latéral, non « inférieur ». Les barres de l'application restent affichées : à 568×320 le dessin mesure ~150 px de haut.
- Hors ligne : écran, dessins et fiches sont dans le bundle précaché par le service worker existant ; aucune vidéo, aucune ressource distante obligatoire (les liens vers les sources sont des liens externes facultatifs).

## Tests

- Vitest : `anatomyLogic.test.ts` (conversion de coordonnées après zoom et redimensionnement, bornes, régions, enregistrement), `content.test.ts` (sources, absence de diagnostic / chiffre / compte à rebours), `backupDeer.test.ts` (aller-retour et rejets).
- Playwright (`e2e/anatomy.spec.ts`, Chromium, tactile émulé) à 320×568, 390×844, 568×320, 844×390 : écran et taille du dessin, toucher + glisser, coordonnées après zoom et rotation, liste de régions, panneau repliable, réinitialisation ; puis : deux dessins distincts, enregistrement / rechargement / modification / retrait, absence de diagnostic, sources attachées, hors ligne.

## Limites connues

- **iPhone réel non testé.** WebKit n'est pas installé dans l'environnement (le projet `webkit` existe, `PLAYWRIGHT_WEBKIT=1`, mais le navigateur n'a pas pu être obtenu) : aucun test WebKit n'a été exécuté. Les tests tactiles sont émulés dans Chromium.
- `height: 100%` sur la grille de l'écran : comportement vérifié dans Chromium seulement.
- Dessins non validés par un spécialiste ; une seule vue (profil gauche) : un tir par le côté droit s'enregistre sur ce profil (la latéralité n'est pas modélisée).
- Capture DeerCast non reçue pendant la mission : l'ergonomie suit la description textuelle de la mission, pas une analyse de l'image.
