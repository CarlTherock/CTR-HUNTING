# Audit fonctionnel ciblé « terrain iOS » — parcours, défauts, corrections

Branche `feat/terrain-repere-camera-sang` (depuis `main` après la PR 15). Cet audit porte sur les **parcours
exécutables** (bouton → écran → résultat), pas sur la simple présence d'un composant. Tous les tests ci-dessous sont
**Chromium / jsdom, carte, GPS et caméra simulés** : **aucun iPhone réel ni WebKit n'a été utilisé.**

## 1. Défauts confirmés et corrections

| #   | Défaut confirmé (comment constaté)                                                                                                                                                                    | Cause réelle                                                                                                                                  | Correction (chemin exact)                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | La caméra d'aide à la recherche de sang est **introuvable** : lecture du code, un seul point d'entrée.                                                                                                | `BloodCameraAssist` n'était monté que dans `BloodPanel`, lui-même rendu seulement avec une recherche ouverte ; `addMarker` exige une session. | Drapeau de store `cameraOpen` (`src/features/blood/state/bloodStore.ts`), hôte `src/features/blood/components/BloodCameraHost.tsx` (Outils → Caméra sang), carte dédiée dans `BloodSessionList.tsx`, entrée « + Repère », bouton visible du panneau. |
| D2  | Enregistrer un indice depuis la caméra sans recherche ouverte échouait.                                                                                                                               | Aucune porte explicite.                                                                                                                       | Choix explicite « Créer une recherche / Annuler » (`BloodCameraAssist.tsx`, `AddPointControl.tsx`). Aucune trace ne démarre sans ce choix.                                                                                                           |
| D3  | Caméra refusée / absente / occupée = impasse ; pas de repli ; pas de reprise après arrière-plan.                                                                                                      | Un seul chemin « flux en direct ».                                                                                                            | Repli « Importer une photo » distingué du direct, nouvel essai, reprise du flux au retour de `visibilitychange`, pistes arrêtées à la fermeture (`BloodCameraAssist.tsx`).                                                                           |
| D4  | Aucun bouton permanent et libellé pour créer un repère ; le bouton existant était une icône sans texte, sans choix de type, sans mode de position (`WaypointControl`).                                | Conception.                                                                                                                                   | Bouton « + Repère » + panneau : `src/features/addpoint/**` (voir §3).                                                                                                                                                                                |
| D5  | Dans une recherche active, « Caméra sang » et « Dernier indice » étaient **cachés** dans la section repliée « Indices et outils ».                                                                    | `BloodPanel.tsx`.                                                                                                                             | Lignes visibles en permanence : + Sang, Pause/Reprendre, Terminer, Caméra sang, Dernier indice ; paysage court compacté (icônes avec nom accessible).                                                                                                |
| D6  | **Défaut introduit puis corrigé pendant le travail** : un « + Repère » large dans la colonne d'outils écrasait le panneau de recherche (≈140 px à 320 px, bouton Terminer rogné). Vu sur capture E2E. | Largeur de colonne mesurée pour réserver le dock.                                                                                             | Bouton compact libellé 56 px (`AddPointControl.tsx`).                                                                                                                                                                                                |
| D7  | **Défaut de l'appui long** (vu en E2E) : le panneau s'ouvrait puis se refermait au relâchement du doigt.                                                                                              | Le clic émis au relâchement du doigt (même plusieurs secondes après l'ouverture) tombait sur le fond du panneau.                              | Si le panneau s'ouvre doigt posé, le fond ignore le clic qui suit le relâchement (`src/features/addpoint/fingerDown.ts`) ; la carte ignore le clic qui suit un appui long (`src/services/map/longPress.ts`, `MapLibreProvider.ts`).                  |
| D8  | Observations « orignal » impossibles à consigner ; DeerTracker est propre au cerf.                                                                                                                    | Pas de champ d'espèce.                                                                                                                        | `Observation.species?: 'moose'` (entrée de journal ordinaire, hors statistiques cerf) — pas de migration.                                                                                                                                            |

## 2. Diagnostic de la caméra sang (chaîne complète)

Bouton (Outils / + Repère / panneau de recherche / page Recherches de sang) → `bloodStore.openCamera()` →
`BloodCameraHost` (chargement différé) → `BloodCameraAssist` → `getUserMedia` (caméra arrière par défaut) → filtre
couleur (original / filtré, sensibilité) → capture → confirmation → `addMarker` (une seule fois) → waypoint
`bloodKind` rattaché à la session → affiché sur la carte → inclus dans la sauvegarde. **Trois choses distinctes** :
appareil photo ordinaire (photo d'un repère, `CameraCapture`), import d'une photo (repli, étiqueté « photo importée »),
caméra avec aide visuelle sang (expérimentale, « faux positifs possibles », jamais « sang détecté »).

Cause de l'invisibilité : **composant non monté hors session + aucune entrée** (D1), pas un problème de permission.

## 3. Parcours livrés (chemins exacts)

| Parcours                         | Où                                                                             | Code                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Carte → « + Repère » (1 toucher) | Rail de droite, premier bouton, libellé « Repère »                             | `src/features/addpoint/components/AddPointControl.tsx`                                                                                      |
| Repère normal (GPS ou carte)     | + Repère → Repère normal → « Créer le repère ici » / « Choisir sur la carte »  | `addPointStore.submit` → `waypointsStore.startDraftAt` / `startPlacing` (fiche existante : nom, icône, couleur, photo, notes, verrouillage) |
| Sang / indice                    | + Repère → Sang / indice (type d'indice, note) ; porte « Créer une recherche » | `addPointStore.submit` → `bloodStore.addMarker` / `startManual` (même moteur que + Sang)                                                    |
| Observation cerf / orignal       | + Repère → Observation cerf / orignal                                          | `journalStore.create` (`deer` pour cerf ; `species: 'moose'` pour orignal)                                                                  |
| Caméra sang                      | + Repère · Outils · panneau de recherche · Recherches de sang · Après le tir   | `bloodStore.openCamera`                                                                                                                     |
| Appui long sur la carte          | Carte                                                                          | `longPress.ts` → `MapPage` `onMapLongPress` → `addPointStore.openSheetAt`                                                                   |
| Après le tir                     | Mes données → Après le tir (`/after-shot`), Accueil → Sur le terrain           | `src/features/aftershot/**`                                                                                                                 |

Position : **Ma position GPS** (précision et ancienneté affichées, `describeGps`) ou **position choisie sur la
carte** ; sans fix récent le panneau l'écrit et n'invente rien. Changer de type ne vide pas les champs (état dans
`addPointStore`).

## 4. « Après le tir » : ce qui est livré et ce qui ne l'est pas

Livré : cerf / orignal ; consigner le tir (heure, position GPS ou manuelle, réaction observée en texte libre,
direction de fuite observée, **estimation manuelle** de la position de l'animal, dernière position confirmée, notes,
photos) ; consigner les indices (→ + Repère sang) ; démarrer / reprendre une recherche (bouton explicite, la trace
rouge démarre seulement si le GPS est prêt) ; caméra sang ; dernier indice ; chronologie ; mini-carte ; rattachement
tir ↔ recherche. Données : entrée de journal avec champ optionnel `shot` (`src/types/observation.ts`) — **aucune
migration Dexie**, incluse dans la sauvegarde ZIP (validation dans `src/features/backup/engine/validate.ts`).

**Non livré** : le **guide expert** (conseils de recherche selon la réaction, délais, lecture des indices). Aucune
source vérifiable ni droit d'utilisation n'est disponible dans ce dépôt ; rien n'est copié des applications de
référence ; l'application ne déduit ni position d'animal, ni gravité de blessure, ni délai. La page le dit.
DeerTracker (journal d'observations de cerfs) est conservé, distinct.

## 5. Audit iOS (ce qui est vérifié, et comment)

| Point                                                 | Statut                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Zones sûres (panneau + Repère, caméra)                | Marges `env(safe-area-inset-bottom)` dans le code ; **émulation CDP** seulement (E2E existants)      |
| Portrait / paysage, 8 tailles dont 568×320 et 844×390 | **E2E Chromium** `e2e/terrain.spec.ts` (visible, dans l'écran, non recouvert, sans chevauchement)    |
| Panneaux / clavier / défilement                       | Actions fixées en bas du panneau ; clavier iOS réel **non testé**                                    |
| Boutons interactifs (pas seulement visibles)          | Test de « hit » (`elementFromPoint`) + clic réel dans l'E2E                                          |
| Rotation                                              | Tailles portrait/paysage testées séparément ; **bascule en direct non testée sur appareil**          |
| Arrière-plan / retour                                 | Reprise du flux caméra : test unitaire (`visibilitychange` simulé) ; iPhone réel **non testé**       |
| Permissions GPS / caméra                              | GPS simulé ; caméra : refus simulé (E2E), absente / occupée / contexte non sécurisé (unitaires)      |
| Safari vs PWA installée                               | **Non testé** (aucun appareil)                                                                       |
| Données conservées après navigation / rechargement    | Dexie (E2E existants de persistance) ; sauvegarde/restauration des nouveaux champs testée (unitaire) |

## 6. Demandé / livré / restant

| Exigence                                                                      | État                                                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Bouton permanent « + Repère » libellé                                         | **Livré** (rail, compact, 56 px)                                                                                                                |
| Choix Repère normal / Sang-indice / Obs. cerf / Obs. orignal / Caméra         | **Livré**                                                                                                                                       |
| Deux modes de position, pas de coordonnées fictives                           | **Livré** (GPS avec précision/âge, ou carte ; refus explicite sans fix)                                                                         |
| Pas de saisie perdue en changeant de type                                     | **Livré** (testé)                                                                                                                               |
| Repère sang = vrai type, goutte rouge, numérotation                           | **Livré** (moteur existant `addBloodMarker`)                                                                                                    |
| Appui long = même parcours                                                    | **Livré** ; **appui long réel sur iPhone non testé** (touch CDP seulement)                                                                      |
| Caméra sang sans session, 4 accès                                             | **Livré** (+ Après le tir)                                                                                                                      |
| Porte « rattacher / créer / annuler », pas de trace silencieuse               | **Livré**                                                                                                                                       |
| Refus / absente / occupée / non sécurisé / arrière-plan, repli photo          | **Livré** (tests) ; flux vidéo réel **non testé**                                                                                               |
| Session : + Sang, Caméra, Dernier indice, Pause/Reprendre, Terminer visibles  | **Livré** (défaut D5 corrigé)                                                                                                                   |
| Après le tir : cerf, orignal, tir, indices, recherche, caméra, dernier indice | **Livré**                                                                                                                                       |
| Guide expert Après le tir                                                     | **NON livré** (sources et droits absents) — affiché comme « à compléter »                                                                       |
| Disposition inspirée onX / HuntStand                                          | **Partiel** : + permanent, Couches/Outils séparés, recentrage, 2D/3D sur rail (déjà là) ; panneau inférieur repliable de détails **non refait** |
| Validation iPhone réelle                                                      | **NON faite**                                                                                                                                   |
| Aucune donnée supprimée / migration                                           | **Livré** : aucune migration, champs optionnels                                                                                                 |
