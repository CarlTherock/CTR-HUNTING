# Comparateur de caches

Compare 2 à 4 points de repère sauvegardés pour **un même créneau horaire**.
Ce n'est **pas** une prévision de réussite : c'est un tri par critères
documentés, avec les données manquantes dites explicitement.

## Parcours

Page « Points de repère » : cocher 2 à 4 points (cases de 44 px, filtre de
territoire respecté) -> « Comparer (N) » -> panneau « Comparaison de caches ».
Petit écran : une carte empilée par point. Écran >= 1024 px : tableau dans son
propre cadre à défilement (jamais la page).

## Données et requêtes (`compareData.ts`)

- UNE grille de vent (5x5, elle porte aussi température, précipitations et
  nuages : pas d'appel météo séparé) et UNE requête de végétation (grille OSM
  8x8) pour l'emprise englobant les points.
- Emprise élargie puis arrondie vers l'extérieur (0,05 deg) ; clé de cache =
  emprise + jour ; durée de vie 10 min. Changer d'heure ne fait aucune requête
  (l'heure est lue dans la grille chargée ; seules les heures présentes sont
  proposées, aucune extrapolation).
- Requêtes en cours partagées entre appelants et annulées (`AbortController`,
  signal passé aux fournisseurs) quand plus personne n'attend leur résultat ;
  un résultat périmé n'écrase jamais le plus récent.
- Un vent déjà chargé par la couche de vent de la carte ou la carte de
  potentiel est réutilisé s'il a moins de 10 min et si chaque point a un point
  de grille à 5 km ou moins.
- Emprise de plus de 40 km : la végétation n'est pas demandée (« habitat non
  évalué »).

## `compareCaches(input) -> CacheComparison` (pure, `types.ts`)

Sortie : `hour`, `criteria` (définitions et règles), `rows` (valeurs par point :
vent, préférence, conditions, habitat, observations, position, âge des données,
évaluation des 5 critères, couverture, données manquantes, avantages,
inconvénients), `ranking` (statut `ranked | tied | not-comparable`, critères
communs, critères qui départagent, entrées avec rang et raisons, points exclus),
`rules`, `disclaimer`. Aucun score numérique n'est produit.

### Critères (`criteria.ts`)

Vent dans une direction préférée ; vent soutenu 5 à 25 km/h ; pas de fortes
précipitations (<= 4 mm/h) ; habitat favorable (indice de végétation > 50) ;
signe de gibier enregistré à proximité (400 m). Seuils repris des analyseurs
(test d'alignement). Chaque critère est satisfait, non satisfait ou **non
évaluable** (donnée manquante : jamais une valeur neutre).

### Tri

1. Un point est classé s'il a au moins 3 critères évaluables sur 5.
2. Le tri compare uniquement les critères évaluables pour **tous** les points
   classés (au moins 2) : aucun point n'est avantagé ou pénalisé par un critère
   que les autres n'ont pas. Les autres critères restent affichés, hors tri.
3. Ordre : nombre de critères satisfaits parmi ces critères communs ; même
   nombre = ex æquo ; tous identiques = « aucun ordre ».
4. Sinon « non comparables » : aucun classement.

Informations non triées : distance depuis ma position, visites, entrées de
journal, rafales.

## Observations

Comptes séparés : **visites** (traces GPS), **signes de gibier** (points de
repère game_sign, kill_site, trail_camera, hors le point comparé), **entrées de
journal**. « Animaux observés » est indisponible : l'application n'a aucune
donnée structurée (le journal est du texte libre). Lecture tous territoires
confondus.

## Position

Distance à vol d'oiseau seulement avec un fix frais (<= 15 s, `gpsFreshness`)
et une précision connue <= 100 m ; sinon « Position indisponible : raison ».

## Actions (`compareActions.ts`)

Voir sur la carte (vue partagée de la carte + /map, comme le Journal), Aller à
(`guidanceStore.start` + /map), Ouvrir la fiche (fiche existante, position
verrouillée), Consulter les observations associées (liste avec liens vers les
fiches et entrées). Aucune action ne modifie un point.

## Limites

- Terrain (pente, exposition) non évalué depuis cette page : il exige la tuile
  d'élévation chargée sur la carte.
- Vent/météo : valeur du modèle du point de grille le plus proche ; deux points
  voisins partagent souvent le même point de grille (signalé : le critère ne
  les départage pas). L'heure « actuelle » est la valeur horaire du modèle.
- Végétation OSM agrégée par cellule : même limite que la carte de potentiel.
