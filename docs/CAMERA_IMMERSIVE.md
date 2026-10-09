# Caméra de sang immersive — diagnostic du cadrage et choix de conception

Branche `feat/camera-immersive` (PR dédiée, séparée de la PR anatomie). Chromium
et jsdom uniquement ; caméra, GPS et carte simulés. **Aucune validation sur
Safari ni sur iPhone réel.**

## 0. Les deux captures de la mission

Les deux images mentionnées dans la mission (caméra actuelle et référence) **ne
sont pas arrivées** dans la session : seul le texte a été reçu. Elles n'ont donc
pas été analysées. Le diagnostic ci-dessous vient des calculs de mise en page
mesurés sur le code réel de `main` (6ed4297), pas d'une capture iPhone.

## 1. Cause confirmée du cadrage

Mesures sur la version de `main` (caméra simulée de 1280×720, Chromium, DPR 2) :
`docs/validation/camera-avant-*-mesures.json` et `camera-avant-*.png`.

| Écran   | Aperçu vidéo               | Bande vide                                                       | Boutons hors écran                                                         |
| ------- | -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 390×844 | 382×155 px                 | bande noire sous les vignettes (voir `camera-avant-390x844.png`) | « Importer une photo » (bas à 848 px pour 844)                             |
| 320×568 | 312×79 px                  | idem                                                             | « Pause », « Capturer », « Importer » (haut à 660 / 716 / 772 px pour 568) |
| 568×320 | 278×58 px (deux vignettes) | —                                                                | « Jaune/Cyan », « Pause », « Capturer », « Importer »                      |

Ce n'est **pas** le shell : le dialogue mesure exactement le viewport
(`x=0, y=0, w, h` = fenêtre) dans les trois cas, aucun ancêtre n'est transformé,
filtré ni `contain`, et la safe-area n'est appliquée qu'une fois (sur le dialogue).

Calculs réellement responsables, tous dans l'ancien `BloodCameraAssist.tsx` :

1. Une **pile verticale** : en-tête + bloc d'avertissement permanent (4 lignes) +
   zone d'aperçu + panneau du bas. Ce qui reste pour l'image est le résidu.
2. L'aperçu « côte à côte » coupe ce résidu en **deux vignettes**
   (`portrait:flex-col`), chacune en `object-contain` : l'image 16:9 y est
   encore réduite et entourée de bandes noires.
3. Le panneau du bas est **plafonné à `maxHeight: 45 %`** avec `overflow-y-auto`
   alors qu'il contient tous les réglages et toutes les actions : son contenu
   (392 px à 390×844, 516 px à 320×568) dépasse sa hauteur (380 / 256 px).
   « Capturer » se retrouve donc **dans un défilement imbriqué**, sous la ligne
   de flottaison.
4. L'écran « aperçu » n'a **aucun** rôle de réserve : le vide noir est la hauteur
   que ni l'image (`object-contain`) ni les contrôles (plafonnés) n'utilisent.

Non vérifiable ici (à tester sur iPhone) : l'effet des barres Safari qui
apparaissent/disparaissent, du clavier, et la différence Safari / app installée.
Le correctif ne dépend d'aucune de ces valeurs : `position: fixed; inset: 0`
(pas `100vh`), commandes placées avec `env(safe-area-inset-*)` une seule fois.

## 2. Ce qui a changé

- **Image sur toute la surface** : `CameraStage` — la vidéo et le canvas de
  surbrillance sont deux boîtes identiques (`absolute inset-0`) avec le même
  `object-fit: cover`. Le canvas garde le ratio de la vidéo (il est seulement
  dessiné plus petit), donc rien n'est étiré.
- **Commandes flottantes** (`CameraOverlay`) : Fermer, Lampe, Paramètres,
  Aide/Infos en haut ; sélecteur Filtrée / Originale / Comparaison, Capturer et
  « + Repère » en bas (une rangée en paysage court). La couche ignore les
  touchers, chaque commande les reprend. Aucun défilement nécessaire.
- **Comparaison** : une seule image coupée par un séparateur (glisser ou
  flèches ← →, `role="slider"`), plus deux vignettes.
- **Avertissement** : mention compacte « Aide visuelle — sang non confirmé » ; le
  bouton Aide/Infos (ou la mention) ouvre le texte complet (faux positifs,
  surbrillance ≠ sang confirmé, absence de surbrillance ≠ absence de sang).
- **Paramètres** en feuille basse (feuille latérale en paysage court) :
  sensibilité, atténuation du fond, couleur Jaune / Cyan / Bleu / Rouge (affichage
  seulement : les pixels candidats sont les mêmes), tons foncés / rouille, son,
  vibration avec l'état de compatibilité, pause d'analyse, import, réinitialiser.
  L'en-tête (bouton de fermeture) ne défile pas ; le flux reste actif derrière.
  Les réglages sont gardés sur l'appareil (`localStorage`, clé
  `ctr.bloodCamera.prefs.v1`, validés à la lecture).
- **Lampe** toujours visible : active si la piste la déclare ; sinon icône barrée,
  message honnête au toucher ; si l'appareil refuse, l'état reste « éteinte ».
- **« + Repère »** depuis la caméra, via le moteur existant (`addMarker`,
  `attachClueMedia`, brouillon de repère) — `useCameraClue.ts` :
  - position = GPS du téléphone avec précision et ancienneté, sinon choix
    explicite sur la carte ; le centre de l'image n'est jamais une position ;
  - « Sang / indice » : recherche ouverte, ou porte explicite (aucune trace en
    silence) ; « Repère normal » : sans recherche ;
  - une capture n'est jointe que si l'utilisateur la garde puis coche
    « Joindre la capture que je viens de prendre » ;
  - un seul enregistrement par appui (verrou), position verrouillée par les
    règles existantes, retour à la caméra avec confirmation.
- **Placement sur la carte** : la caméra se met en pause (analyse arrêtée,
  contenu masqué, dialogue transparent aux touchers) **sans démonter la
  vidéo** : même flux, pas de seconde instance. Ancien défaut corrigé : la
  vidéo était démontée pendant le placement et jamais ré-attachée.
- **Capture** : la photo garde l'image **entière** (pas seulement la partie
  visible après le recadrage d'écran) ; pied de page fixe (Confirmer un indice /
  Garder et revenir à la caméra / Écarter), corps défilant.
- **Performance** : la résolution d'analyse reste 320 px de large, indépendante
  de la taille d'affichage ; une seule boucle, arrêtée en pause / arrière-plan /
  capture / placement / fermeture.

## 3. Plein écran et zones sûres

- « Immersif » = le dialogue couvre le viewport (`fixed inset-0`). Il ne dépend
  **pas** de l'API Fullscreen et ne promet pas de masquer les indicateurs iOS.
- `viewport-fit=cover` est déjà dans `index.html`. Le fond (image) va jusqu'aux
  bords ; les boutons sont dans `max(0.5rem, env(safe-area-inset-*))`, appliqué
  une seule fois (couche de commandes, feuilles, pied de la revue de capture).
- Le shell partagé n'a pas été modifié : le défaut n'y était pas.

## 4. Tests

- Vitest : `BloodCameraAssist.test.tsx` (comparaison, quatre couleurs,
  réglages gardés, lampe indisponible / refusée, aide, + Repère GPS absent /
  ancien / sans recherche / double appui / capture jointe sur demande…),
  `cameraSupport.test.ts` (préférences, recadrage `cover`),
  `bloodHighlight.test.ts` (quatre couleurs, mêmes pixels candidats).
- Playwright (`e2e/camera.spec.ts`, Chromium) à 320×568, 390×844, 430×932,
  568×320 et 844×390, puis rotation : commandes visibles, cliquables, entières
  et non recouvertes ; dialogue, scène, vidéo et canvas = viewport ; coins et bord
  bas non noirs ; correspondance vidéo/filtre mesurée **en pixels** à partir de
  la relation `cover` (dedans surligné, dehors non, à l'identique en original et
  de chaque côté du séparateur) ; quatre couleurs ; feuille de paramètres bornée
  au viewport avec le flux actif derrière ; + Repère avec capture jointe sur
  demande et porte de recherche ; permission refusée ; fermeture libérant les
  pistes ; GPS absent.

## 5. Limites réelles

- **iPhone réel et Safari non testés.** WebKit n'est pas installable ici.
  Les tests Chromium ne prouvent ni la torche, ni le flux vidéo sous Safari, ni
  l'effet des barres du navigateur, ni la mise en pause d'une vidéo masquée.
- La **torche** est généralement absente sous iOS Safari : l'écran affichera
  « Lampe indisponible » (un écran blanc n'est pas une lampe).
- Le GPS « ancien » est couvert par les tests unitaires (position de 3 min), pas
  par un test e2e.
- Le placement d'un **repère normal** sur la carte utilise le formulaire de la
  carte ; la note saisie dans la feuille caméra n'y est pas reprise (le
  formulaire a ses propres notes), seule la photo jointe l'est.
- Les images « avant » viennent de la caméra simulée sur `main`, pas d'un
  iPhone.
