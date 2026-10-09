# Analyse du vent sur la carte (barre de temps)

Organisation inspirée de HuntStand (feuille basse repliable, jours, heures),
mais **la visualisation reste la nôtre** : traits/particules animés sur le
satellite. Pas de cercles, de rayons ni de zones HuntZone/LandZone.

> Validation : tests unitaires (jsdom) et e2e **Chromium** avec carte, GPS et
> prévisions **simulés**. WebKit n'est pas disponible ici et **aucun iPhone réel
> n'a été testé**. Les captures de `docs/validation/vent-analyse-*.png` montrent
> la carte factice des tests (fond violet), pas du satellite.

## Parcours d'accès

Rail de la carte → **Météo et radar** → bouton **Analyse du vent** (allume les
traits de vent s'ils étaient éteints). Le panneau « Carte météo » est alors
remplacé par la feuille d'analyse (les couches radar/prévision restent
affichées). Le bouton du rail ramène le panneau des couches.

## Nature des données (vérifiée dans le code)

- Source : **Open-Meteo**, une seule requête groupée pour une **grille 5 × 5**
  de la zone visible (`OpenMeteoWindProvider`, `windStore.GRID_SIZE`).
- Résolution temporelle : **1 valeur par heure**, `forecast_days=2` → 48
  créneaux, du minuit local d'aujourd'hui à demain 23:00 (`timezone=auto`).
  Les jours proposés sont donc **Aujourd'hui** et **Demain** ; rien au-delà.
- C'est un **champ spatial réel** (25 points), pas un vent ponctuel — mais les
  traits utilisent l'**échantillon le plus proche**, sans interpolation, et leur
  vitesse est exagérée pour rester lisible. Ils ne montrent **ni le vent local
  entre les arbres ni l'effet du relief** ; le panneau le dit (« Rendu
  indicatif »).
- Deux horloges distinctes existent : les images GeoMet (radar/HRDPS,
  `weatherMapStore.frameIndex`) et les créneaux Open-Meteo
  (`windStore.selectedHourOffset`). La barre pilote **les créneaux Open-Meteo**.
  Avec l'analyse ouverte, une image radar qui arrive en retard ne déplace plus
  l'heure choisie.

## Synchronisation réelle

- La sélection est `windStore.selectedHourOffset` : le **même** curseur que le
  panneau « Vent » de la page Météo, les graphiques et Soleil & Lune. Aucun
  second état horaire.
- Déplacer la barre appelle `setSelectedHourOffset` ; `MapPage` envoie alors
  `setWindField(champ, indice, 'wind')` au moteur de rendu, qui lit
  `hourly[indice]` de chaque échantillon à chaque image. Aucune requête réseau
  pendant le déplacement (le champ de 48 h est déjà chargé).
- Les tests (`MapPage.test.tsx`, « Analyse du vent ») utilisent des créneaux à
  direction et vitesse **différentes à chaque heure** (7° × indice,
  3 + indice km/h) et vérifient que l'appel de rendu reçoit le bon indice et que
  `hourly[indice]` porte les bonnes valeurs.
- Figer/animer les traits ne change **pas** l'heure ; seule la barre choisit
  l'heure de prévision. Il n'y a **pas de bouton Lecture temporelle** : aucune
  animation de progression dans les heures n'est implémentée.

## Conventions

- Texte : **d'où vient** le vent (« Vent du SSE (165°) »). Flèche et traits :
  **vers où il souffle** (origine + 180°). Points cardinaux géographiques,
  indépendants de l'orientation de la carte et du cap du téléphone.
- Unités : **km/h** (le réglage actuel de l'application ; aucune préférence
  d'unité n'existe encore).

## Données manquantes, hors ligne, anciennes

| Situation                                              | Affichage                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Chargement sans données                                | « Chargement… La carte n'affiche pas encore l'heure choisie », barre désactivée            |
| Source en panne, aucune copie                          | « Prévisions de vent indisponibles », aucune valeur, bouton Réessayer                      |
| Source en panne, copie enregistrée **de la même zone** | « Hors ligne : copie enregistrée le … (il y a …) »                                         |
| Copie d'une autre zone                                 | refusée (indisponible)                                                                     |
| Actualisation en échec avec un champ déjà affiché      | valeurs gardées + « Actualisation impossible : valeurs récupérées le … »                   |
| Prévision de plus de 3 h                               | « Prévisions anciennes (il y a … h) »                                                      |
| Créneau sélectionné absent des données                 | « Ce créneau n'existe pas… » + « Aller au créneau le plus proche » (jamais le vent actuel) |

Une requête plus ancienne ne remplace jamais la plus récente (numéro de requête

- `AbortController` dans `windStore.fetch`). La copie est enregistrée dans les
  réglages locaux (`lastWindField`) après chaque réponse réussie.

## Coordination des feuilles du bas

- La feuille est dans le **dock en bas à gauche**, au-dessus du guidage et de la
  recherche de sang : elle ne couvre ni « Arrêter le guidage », ni « + Repère »
  (rail à droite), ni la navigation.
- Guidage actif, écran assez haut : la feuille s'ouvre et **le guidage se
  replie sur sa ligne** (« Arrêter le guidage » y reste).
- Recherche de sang en cours, éditeur de repère ouvert, ou guidage en paysage
  court (≤ 480 px de haut) : la feuille reste une **barre d'une ligne** (heure,
  vent, flèches ‹ ›), dépliable quand la place revient.
- Le panneau « Carte météo » et la feuille ne sont jamais ouverts ensemble.

## Petits écrans

Paysage court (≤ 480 px) : jours et titre sur une ligne, heure + vent compact +
bouton Maintenant (icône) sur la suivante, puis la barre ; cartes horaires et
pied (source, figer) défilent ou sont masqués selon la hauteur. Les rafales
s'affichent dans la ligne compacte seulement si la largeur le permet, sinon dans
« Source et détails » et dans la valeur lue par les lecteurs d'écran.

## Limites connues

- iPhone réel et WebKit non testés (la barre utilise des événements pointeur +
  `touch-action: pan-y` ; à confirmer sur appareil).
- Pas de prévision au-delà de demain (limite de la requête actuelle,
  `forecast_days=2`).
- Pas de « lecture » automatique dans le temps.
- Zones sûres : appliquées par la coque de l'application, la feuille n'en ajoute
  pas ; vérifiées en émulation Chromium seulement.
