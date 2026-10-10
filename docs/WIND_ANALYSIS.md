# Analyse du vent sur la carte (barre de temps)

Organisation inspirée de HuntStand (feuille basse pleine largeur, repliable,
jours, heures), mais **la visualisation reste la nôtre** : traits/particules
animés sur le satellite. Pas de cercles, de rayons ni de zones HuntZone/LandZone.

> Validation : tests unitaires (jsdom) et e2e **Chromium** avec carte, GPS et
> prévisions **simulés**. WebKit n'est pas disponible ici et **aucun iPhone réel
> n'a été testé**. Les captures de `docs/validation/vent-analyse-*.png` montrent
> la carte factice des tests (fond violet), pas du satellite.

## Parcours d'accès

Rail de la carte → **Météo et radar** → bouton **Analyse du vent** (allume les
traits de vent s'ils étaient éteints). Le panneau « Carte météo » est alors
remplacé par la feuille d'analyse. À la fermeture (✕), la navigation du bas
revient et le panneau « Carte météo » se rouvre ; la carte, son zoom, sa
position et l'heure sélectionnée sont conservés.

## Disposition (v2 : pleine largeur, ancrée en bas)

La première version (PR 20) plaçait la feuille dans le **dock en bas à gauche** :
sa largeur était celle de l'écran moins la réserve du rail d'outils (≥ 7 rem) et
plafonnée à `max-w-md` — une colonne étroite, donc haute, qui cachait la carte
sans remplacer la barre du bas. Elle est maintenant **rendue dans la zone de la
carte, en pleine largeur, collée au bord bas** (`absolute inset-x-0 bottom-0`).

Trois positions :

| Position    | Contenu                                                                                                   | Hauteur (portrait 390 × 844)                   |
| ----------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Repliée** | une ligne : flèche, heure, jour, « du SSE · 16 km/h », ‹ ›, ✕                                             | ≈ 95 px                                        |
| **Ouverte** | titre ▾, Maintenant, ✕ · 5 jours · heure + direction + vitesse + rafales · Détails, Figer · barre horaire | ≈ 211 px (≈ 25 %)                              |
| **Détails** | + source, récupération, point utilisé, rendu indicatif, conventions, Actualiser                           | plafonné à 58 % de l'écran, défilement interne |

La poignée se **glisse** (haut = plus de contenu, bas = moins) ; le titre ▾, ✕
et les boutons ‹ › font la même chose sans geste. La zone sûre du bas est
intégrée à la feuille (`env(safe-area-inset-bottom)`), sauf en mode immersif
(la coque l'applique déjà) et dès `md` (la carte a alors sa marge de page).
Paysage court (≤ 480 px de haut) : disposition dédiée sur deux rangées — jours,
heure, boutons à icônes ; barre — au lieu d'une grande fenêtre.

### Navigation du bas

Quand l'analyse est ouverte (n'importe quelle position), `AppShell` **démonte**
la barre Accueil/Carte/Mes données/Météo/Plus : aucune hauteur vide, rien de
focalisable derrière la feuille. La barre n'est pas supprimée du projet : elle
revient à la fermeture. Seule la page Carte est concernée.

### Rail d'outils, dock, attributions

- Rail : pendant l'analyse, les outils **secondaires** (Couches, 2D/3D, Outils,
  Mode immersif) sont masqués (`data-rail-secondary`, règle CSS sur
  `[data-wind-sheet]`). Restent : + Repère, sang, position, suivi, Météo et la
  boussole. Le rail s'arrête **au-dessus** de la feuille (`--sheet-height`,
  mesurée par la feuille elle-même) et ne réduit jamais sa largeur.
- Dock (guidage, recherche de sang, mesure) : remonté au-dessus de la feuille.
  « Arrêter le guidage » et les actions critiques restent atteignables ; rien
  n'est masqué pour gagner de la place. Règles inchangées : guidage + écran haut →
  le guidage se replie sur sa ligne (son bouton Arrêter y reste) ; recherche de
  sang, éditeur de repère ou guidage en paysage court → la feuille reste une
  ligne.
- Attributions : le contrôle MapLibre compact démarrait **ouvert**
  (attribut `open`), d'où le grand bloc blanc. Il est maintenant créé fermé
  (bouton ⓘ, crédits de tous les fournisseurs dans le détail) et posé **au-dessus**
  de la feuille.
- La carte occupe toute la surface disponible : le conteneur grandit quand la
  barre du bas disparaît et le moteur est redimensionné (observateur existant).

### Cause du « bandeau noir sous la navigation » (mesuré)

Mesures Chromium, émulation iPhone (390 × 844, encoche) : coque `h-dvh` =
844 px, carte et canvas = 685 px (de y = 68 à 753), barre du bas = **91 px**
(de 753 à 844) = barre de 56 px + `env(safe-area-inset-bottom)` = 34 px appliqués
une seule fois, par la barre (`BottomNav`) ; pas de double application dans le
corps ni la coque (hors mode immersif). La bande sombre sous les libellés est
donc **la zone sûre incluse dans la barre**, sur un fond presque noir : voulue,
mais très visible. Elle disparaît quand l'analyse est ouverte, la feuille
prenant ce bord. Je n'ai **pas** pu mesurer sur l'iPhone réel ni voir votre
capture : un écart éventuel (barre d'URL Safari, hauteur dynamique) n'est pas
exclu.

L'interface immersive de l'application est indépendante de l'API Plein écran :
la disposition ne dépend pas d'elle et ne masque pas les éléments système d'iOS.

## Nature des données (vérifiée dans le code)

- Source : **Open-Meteo**, une seule requête groupée pour une **grille 5 × 5**
  de la zone visible (`OpenMeteoWindProvider`, `windStore.GRID_SIZE`), avec
  `hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m` (+ température,
  précipitations, nébulosité).
- Résolution temporelle : **1 valeur par heure**, **`forecast_days=5`**
  (`WIND_FORECAST_DAYS`) → jusqu'à 120 créneaux, du minuit local d'aujourd'hui à
  la fin du 5ᵉ jour (`timezone=auto`). La documentation d'Open-Meteo accepte
  `forecast_days` de 1 à 16 ; aucun paramètre ni modèle du code ne limitait à
  48 h autre que cette valeur (`2`). Les jours sont construits à partir des
  **dates réelles des créneaux reçus** (fuseau du champ), pas d'un nombre fixe :
  un jour de changement d'heure compte 23 ou 25 créneaux, une série plus courte
  donne moins de jours. Rien n'est dupliqué ni inventé.
- Coût : une requête, 25 points × 120 h — pas de requête supplémentaire
  pendant le déplacement du curseur.
- C'est un **champ spatial réel** (25 points), pas un vent ponctuel — mais les
  traits utilisent l'**échantillon le plus proche**, sans interpolation, et leur
  vitesse est exagérée pour rester lisible. Ils ne montrent **ni le vent local
  entre les arbres ni l'effet du relief** ; le panneau le dit (« Rendu
  indicatif »). Une prévision à 4-5 jours est par nature moins fiable qu'à 24 h ;
  la source ne fournit pas d'indice de confiance, le panneau n'en invente pas.
- Deux horloges distinctes existent : les images GeoMet (radar/HRDPS,
  `weatherMapStore.frameIndex`) et les créneaux Open-Meteo
  (`windStore.selectedHourOffset`). La barre pilote **les créneaux Open-Meteo**.
  Avec l'analyse ouverte, une image radar qui arrive en retard ne déplace plus
  l'heure choisie.
- Le **panneau Météo** (prévision température/pluie, `weatherStore`) garde sa
  propre requête de 48 h : seule la partie **Vent** de la page Météo passe à
  5 jours. Quand l'heure partagée dépasse les 48 h du graphique, celui-ci
  l'indique au lieu de dessiner un curseur trompeur.
- Cache hors ligne : la copie `lastWindField` contient la série complète
  (5 jours) ; une ancienne copie de 48 h reste utilisable et n'offre que
  ses 2 jours.

## Synchronisation réelle

- La sélection est `windStore.selectedHourOffset` (0 … dernier créneau du champ
  chargé, ex. 119) : le **même** curseur que le panneau « Vent » de la page Météo
  (désormais avec ses puces de jour), les graphiques et Soleil & Lune. Aucun
  second état horaire.
- Changer de **jour** garde l'heure correspondante si le créneau existe, sinon
  choisit le plus proche et le dit.
- Déplacer la barre ou changer de jour appelle `setSelectedHourOffset` ;
  `MapPage` envoie alors `setWindField(champ, indice, 'wind')` au moteur de
  rendu, qui lit `hourly[indice]` de chaque échantillon à chaque image.
- Tests : `MapPage.test.tsx` (« Analyse du vent ») utilise des créneaux à
  direction et vitesse **différentes à chaque heure** (7° × indice,
  3 + indice km/h) sur 120 h et vérifie que le **jour 5** envoie `96 + heure` au
  rendu avec ses propres valeurs ; l'e2e donne en plus une rotation de
  directions propre à chaque jour.
- Figer/animer les traits ne change **pas** l'heure ; « Maintenant » revient à
  l'heure actuelle, jamais à l'heure choisie. Il n'y a **pas de bouton Lecture
  temporelle**.

## Conventions

- Texte : **d'où vient** le vent (« Vent du SSE (165°) »). Flèche et traits :
  **vers où il souffle** (origine + 180°). Points cardinaux géographiques,
  indépendants de l'orientation de la carte et du cap du téléphone.
- Unités : **km/h** (le réglage actuel de l'application).

## Données manquantes, hors ligne, anciennes

| Situation                                              | Affichage                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Chargement sans données                                | « Chargement… La carte n'affiche pas encore l'heure choisie », barre désactivée            |
| Source en panne, aucune copie                          | « Prévisions de vent indisponibles », aucune valeur, bouton Réessayer                      |
| Source en panne, copie enregistrée **de la même zone** | « Hors ligne : copie enregistrée le … (il y a …) »                                         |
| Copie d'une autre zone                                 | refusée (indisponible)                                                                     |
| Série plus courte que 5 jours                          | seuls les jours réellement reçus sont proposés                                             |
| Actualisation en échec avec un champ déjà affiché      | valeurs gardées + « Actualisation impossible : valeurs récupérées le … »                   |
| Prévision de plus de 3 h                               | « Prévisions anciennes (il y a … h) »                                                      |
| Créneau sélectionné absent des données                 | « Ce créneau n'existe pas… » + « Aller au créneau le plus proche » (jamais le vent actuel) |

Une requête plus ancienne ne remplace jamais la plus récente (numéro de requête

- `AbortController` dans `windStore.fetch`).

## Limites connues

- iPhone réel et WebKit non testés (la barre utilise des événements pointeur +
  `touch-action: pan-y` ; la poignée glissante aussi : à confirmer sur appareil).
- Pas de « lecture » automatique dans le temps.
- Prévision à 4-5 jours : horizon réel mais moins fiable ; aucune confiance n'est
  chiffrée.
- Autres feuilles du bas (profil d'élévation, hors ligne, analyse…) : elles
  s'ouvrent depuis « Outils », masqué pendant l'analyse ; une feuille déjà
  ouverte avant l'analyse passerait au-dessus de celle-ci (non coordonné
  globalement).
- Zones sûres vérifiées en émulation Chromium seulement.
- Police : la CI n'a pas Inter ; la mise en page a aussi été vérifiée avec Inter
  masquée (police de secours plus large) à 320 × 568.
