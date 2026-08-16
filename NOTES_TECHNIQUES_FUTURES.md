# Notes techniques futures

**Statut :** notes de référence, non normatives.
**Autorité :** `PROJECT_SPECIFICATION.md` et `ARCHITECTURE.md` restent les
seules sources de vérité pour ce qui est construit et pourquoi. Ce fichier
ne remplace ni ne modifie ces documents — il regroupe des pistes externes
évaluées, à reconsidérer quand leur phase arrive, pas avant.

**Origine :** revue d'un document de recommandations externe
(`deepseek.txt`, 2026-08-15), trié en trois catégories après vérification :
à garder pour plus tard, déjà fait, et rejeté (avec raison). Rien de ce
fichier n'a été appliqué au code — voir la conversation du 2026-08-15 pour
le détail de chaque vérification.

---

## À reconsidérer, phase par phase

### Phase 3 — Offline
- **PMTiles** pour le stockage local des tuiles (format single-file
  indexé, bien supporté par MapLibre via un protocole dédié) — alternative
  à évaluer face à un stockage IndexedDB/OPFS "maison" pour les tuiles.
- **OPFS (Origin Private File System)** pour les gros binaires (tuiles,
  photos) plutôt qu'IndexedDB — meilleure gestion d'espace pour de gros
  volumes. Dexie/IndexedDB reste approprié pour les données structurées
  (waypoints, traces, observations).
- Checksum sur les tuiles téléchargées avant stockage (intégrité).
- Job de nettoyage automatique si le stockage local dépasse un seuil
  (ex. 80 %) — proposer de supprimer les zones offline les moins
  récentes.
- Estimateur de taille **et temps restant** pour le téléchargement d'une
  zone (le plan actuel prévoit déjà l'estimation de taille ; ajouter le
  temps restant est une précision utile).
- Stratégies de cache Workbox différenciées : `Stale-While-Revalidate`
  pour les assets JS/CSS, `Cache-First` avec politique LRU pour les
  tuiles. Cohérent avec ce que `ARCHITECTURE.md` prévoit déjà ("runtime
  caching strategies... deferred to Phase 3") — à préciser à ce moment.

### Phase 4 — Terrain 3D
- Utiliser `setTerrain` de MapLibre plutôt qu'une bibliothèque 3D externe
  (Three.js) — évite une dépendance lourde et garantit la synchronisation
  2D/3D. Bon réflexe, à appliquer telle quelle.
- **Martini** pour le décodage RTIN des données d'élévation (maillage à
  partir d'un raster DEM).

### Phase 6 — Vent
- Modèle de particules ("flow field") plutôt qu'un moteur physique
  (CFD) — visuellement suffisant, largement plus léger. Bonne approche.

### Phase 14 — IA
- Approche hybride : modèle local léger (ex. ONNX Runtime Web) pour les
  tâches simples (tendances, classification), appel API pour les tâches
  complexes (synthèse, comparaison).
- Rappel (déjà une règle du projet, pas une nouveauté) : l'IA ne génère
  jamais de donnée de terrain/météo — elle interprète ce que fournit la
  couche de données existante. Voir `src/types/data-quality.ts`.

### Process / outillage (à évaluer si le projet grossit)
- Commits au format Conventional Commits (`feat:`, `fix:`, `ci:`...) —
  déjà notre pratique de fait, pas besoin d'outillage pour l'instant.
- Storybook/Ladle pour isoler et documenter le design system — à
  reconsidérer si le nombre de composants UI augmente significativement
  (probablement pas avant la Phase 11 ou 17). Prématuré aujourd'hui pour
  ~5 composants.
- `standard-version`/`release-please` pour automatiser le changelog — à
  peser : notre `CHANGELOG.md` actuel est narratif (explique le *pourquoi*
  des décisions), plus riche que ce que ces outils génèrent automatiquement
  à partir des messages de commit. Pas un gain évident pour ce projet.
- Environnements dev/staging/prod formalisés — à envisager seulement si
  une vraie infrastructure de staging existe un jour ; inutile tant que le
  déploiement est un simple GitHub Pages + secret unique.

### Benchmarks de performance (référence pour Phase 16 — Tests & Optimisation)

| Indicateur | Objectif |
| --- | --- |
| First Contentful Paint | < 1.5 s |
| Time to Interactive (4G) | < 3 s |
| Bundle JS (gzippé) | < 1.5 MB |
| Rendu d'une vue carte | < 200 ms |
| Consommation batterie | < 20 % / heure d'usage actif |
| Taux de succès de synchronisation | > 99.9 % |

À mesurer avec Lighthouse/Web Vitals et des tests Playwright automatisés,
le moment venu.

---

## Déjà fait (le document les présentait comme nouveaux)

- **Interface découplant la logique métier du moteur cartographique**
  (le document propose une `IMapBridge` avec `addLayer`/`addWaypoint`/
  `addTrack`/`setTerrain`/`flyTo` dessinée d'un coup) — c'est exactement
  le rôle de `MapProvider`/`MapTilerProvider` (`src/services/map/`),
  construit dès la tranche 1.1. Différence assumée : notre interface ne
  grossit qu'au fur et à mesure des besoins réels (`setView`,
  `setBaseLayer` jusqu'ici) plutôt que d'exposer par avance des méthodes
  pour des fonctionnalités qui n'existent pas encore (waypoints en
  Phase 2, terrain en Phase 4) — cohérent avec la règle "vertical slices"
  du projet.
- **"Moteur de règles" qualifiant la donnée avant l'IA** — déjà
  implémenté au niveau des types depuis la Phase 0 :
  `DataConfidence`/`DataPoint<T>` (`src/types/data-quality.ts`) force la
  distinction measured/calculated/estimated/ai_interpretation/
  user_observation partout où une valeur est affichée.

---

## Idées d'apps concurrentes (onX Hunt, HuntStand) — 2026-08-16

**Origine :** captures d'écran onX Hunt fournies par l'utilisateur (page
"What are Waypoints/Area Shapes/Line Distance/Tracking", "3D Hunting
Maps") + recherche web sur HuntStand. Sources :
- [onX Hunt — App Features](https://www.onxmaps.com/hunt/app/features)
- [onX Hunt — Land Ownership Maps & Parcel Viewer](https://www.onxmaps.com/hunt/app/features/land-ownership-maps-parcel-viewer)
- [HuntStand — Detailed Guide to App Tools](https://www.huntstand.com/fieldnotes/deer/a-detailed-guide-to-huntstand-app-tools-for-deer-hunters/)
- [HuntStand — Google Play](https://play.google.com/store/apps/details?id=com.huntstand.core)

Trié en deux catégories : ce que notre feuille de route couvre déjà (juste
des précisions utiles à retenir), et les vraies idées absentes du plan
actuel.

### Déjà couvert par la feuille de route — précisions à retenir
- **Prévision d'activité du gibier basée météo/lune** (le "15-Day
  Whitetail Activity Forecast" de HuntStand) — confirme que Phase 7
  (données temporelles/lunaires) + Phase 8 (Analytics Engine) + Phase 9
  (carte d'analyse/scores) sont la bonne décomposition. Rien à changer,
  juste une validation que l'architecture prévue est la bonne.
- **Vent en direct + prévision** — Phase 6 existante.
- **Terrain 3D avec bascule satellite/hybride, hors ligne** — Phases 3 et
  4 existantes.
- **Enregistrement de trace (breadcrumbs)** — Phase 2, tranche 2.3
  (pas commencée). Détails concrets à retenir pour cette tranche :
  gain/perte d'élévation, vitesse, distance, pause/reprise, et un
  "trimming" de trace (retirer la fin d'une trace, ex. le trajet en
  camion après la chasse) — precision utile, pas juste "enregistrer un
  trajet".
- **Rayon autour d'un waypoint + vent relatif à ce point précis** — notre
  Phase 6 (vent) et les waypoints (Phase 2) existent déjà séparément ;
  l'idée d'un indicateur de vent *relatif à un stand spécifique* (pas
  juste le vent global sur la carte) est une bonne précision pour quand
  ces deux pièces se rencontrent.

### Absent de la feuille de route actuelle — vraies nouvelles idées
- **Limites de propriété + nom du propriétaire** (onX : "Land Ownership
  Maps & Parcel Viewer" — clique un lot, voit propriétaire/adresse
  fiscale/superficie). Fonctionnalité réellement absente des 17 phases
  actuelles. Nécessiterait une source de données cadastrales — **onX/
  HuntStand sont centrés É-U** ; pour le Québec, l'équivalent serait les
  données cadastrales ouvertes du Québec (ex. le jeu de données "Cadastre
  du Québec" sur Données Québec, ou le Rôle d'évaluation foncière
  municipal) plutôt qu'un fournisseur américain comme Regrid. À
  positionner comme un nouveau layer (même mécanisme que les overlays
  Phase 1.4) une fois qu'une vraie source de données québécoise est
  identifiée et validée — jamais fabriquer cette donnée.
- **Zones de chasse / unités de gestion de la faune (limites publiques)**
  — équivalent québécois des "public land / GMU boundaries" d'onX. Fait
  écho directement aux données MELCC vues dans la toute première capture
  d'écran de cette conversation (l'appli Domtar "Mirador"). Même
  remarque : nécessite une vraie source (données ouvertes du Québec /
  Faune Québec), à valider avant d'implémenter.
- **Outil de mesure de surface (polygone → acres/hectares)** — utile pour
  mesurer un food plot ou une parcelle publique. Aucune tranche actuelle
  ne couvre ça explicitement ; pourrait s'ajouter à Phase 2 (Waypoints &
  Tracks) comme un outil complémentaire, ou une petite tranche dédiée.
- **Outil de mesure de distance en ligne droite** (ex. évaluer un couloir
  de tir) — petit utilitaire, facile à ajouter une fois l'outil de
  mesure de surface en place (même famille d'interaction : dessiner sur
  la carte, afficher une mesure).
- **Synchronisation avec caméras de chasse cellulaires tierces**
  (Stealth Cam, Muddy — HuntStand importe leurs photos directement).
  Portée plus large qu'une simple tranche (nécessite l'API de chaque
  fabricant) — à ne considérer qu'après la Phase 12 (caméra intégrée) et
  seulement si la demande utilisateur le justifie. Priorité basse.

---

## Recherche compétitive approfondie et vérifiée — 2026-08-16

**Origine :** approfondissement demandé de la section précédente — vérifier
en détail onX Hunt et explorer d'autres apps/sites, chaque fait confirmé
via recherche web (pas de mémoire seule), avec sources citées. Recherche
effectuée par un agent dédié ; toutes les affirmations ci-dessous ont une
source vérifiée en 2026-08-16.

### onX Hunt — détails vérifiés (au-delà de ce qui était déjà noté)
- **Hors ligne** : téléchargement à l'avance, GPS en temps réel sans
  réseau. Payant uniquement.
  [Source](https://www.onxmaps.com/hunt/app/faq)
- **Météo/vent** : météo live, prévisions, direction du vent,
  lever/coucher du soleil, pression barométrique ; "Optimal Wind"
  configurable **par waypoint** — rejoint notre idée déjà notée de vent
  relatif à un stand.
  [Source](https://www.onxmaps.com/hunt/app/features)
- **Limites de propriété/propriétaire** — confirmé payant (palier
  Premium+), couverture É-U + partielle Canada seulement.
  [Source](https://www.onxmaps.com/hunt/app/features/land-ownership-maps-parcel-viewer)
- **TerrainX** (palier Elite seulement) : angle de pente, aspect, patrons
  d'élévation, exagération 3D sur bureau.
  [Source](https://www.onxmaps.com/hunt/elite/map-tools)
- **Couches complémentaires** : distribution des cultures agricoles,
  feux de forêt historiques, zones sans routes, sol, angle de pente.
  [Source](https://www.onxmaps.com/hunt/app/features/aerial-imagery)
- **Caméras de chasse** : synchronisation + analyse IA automatique des
  photos ; palier Elite ajoute des alertes ciblées cerf + corrélation
  vent/heure.
- **Partage d'équipe hors ligne (pair-à-pair)** : partage de marquages
  sans aucun réseau, entre appareils de la même plateforme à proximité —
  mécanisme distinct d'une synchronisation cloud classique.
  [Source](https://www.onxmaps.com/hunt/app/features/offline-sharing)
- **Zones publiques au Canada** : oui, mais seulement au palier Elite et
  seulement C.-B./Alb./Sask. — **pas le Québec**.
  [Source](https://www.onxmaps.com/hunt/blog/onxmaps-canada-find-out-what-hunt-app-features-currently-apply)
- **"IA/CoPilot"** : aucun produit nommé "CoPilot" — seule IA réelle est
  le tri automatique des photos de caméra ; "copilot" n'est que du
  vocabulaire marketing pour la navigation mains libres.
- **Prix vérifiés** : Premium 34,99 $/an (1 état), Elite 99,99 $/an ou
  14,99 $/mois (tout + Canada partiel).
  [Source](https://www.onxmaps.com/hunt/app/pricing)

### Apps déjà couvertes — approfondissement
- **HuntStand** : synchronisation caméra limitée à Stealth Cam/Muddy
  (via GSM Command Pro) — plus étroit que l'approche multi-marques d'onX.
  Palier Pro (34,99 $/an) ajoute données de parcelle + imagerie mensuelle
  + hors ligne.
  [Source](https://www.huntstand.com/fieldnotes/deer/a-detailed-guide-to-huntstand-app-tools-for-deer-hunters/)

### Autres apps découvertes — vraiment pertinentes pour nous

- **iHunter (Canada, app native québécoise/bilingue FR-EN)** — le
  précédent le plus directement comparable à notre contexte : couvre
  explicitement le Québec (zones de chasse avec résumés de saison par
  zone, gros gibier/prédateurs/oiseaux/petit gibier), waypoints,
  calculateur solaire, vent/météo, cartes hors ligne. Couches propriétaire
  limitées à Alb./Sask./Man. (pas encore le Québec).
  [Source](https://www.ihunterapp.com/features/) ·
  [Google Play — iHunter Québec](https://play.google.com/store/apps/details?id=com.insideoutside.ihunterqb)
- **BetterHunts (Canada)** — découverte de cette recherche, pas connue
  avant : cotes de tirage, statistiques de récolte, saisons par unité de
  gestion de la faune, **toutes sourcées de données gouvernementales
  publiques** (jamais fabriquées) — exactement notre propre règle de
  donnée. Couches : coupes forestières, historique de feux, terres
  publiques/Couronne. Couverture **partielle au Québec** (Alb./Sask./Ont./
  N.-B. en couverture complète). Précédent concret à étudier si on
  construit un jour l'équivalent québécois des zones/unités de gestion.
  [Source](https://www.betterhunts.ca/about)
- **Spartan Forge (É-U)** — le plus orienté IA du groupe : prédiction de
  mouvement du cerf par réseau de neurones entraîné sur des données de
  cerfs collier-GPS ; score de **"Patternability"** (fiabilité de la
  prédiction du jour, pas juste la prédiction elle-même) — s'arrimerait
  bien avec notre système `DataConfidence` déjà en place.
  [Source](https://spartanforge.ai/pages/deer-prediction)
- **CalTopo (É-U/Canada, planification terrain)** — l'outil le plus
  rigoureux d'analyse de terrain du groupe : **ombrage de terrain
  combiné** (élévation + pente + aspect + couvert forestier en une seule
  couche configurable) — plus flexible qu'un simple outil d'élévation
  comme TerrainX d'onX. Bonne cible technique pour notre Phase 4 plutôt
  que de viser seulement l'équivalent d'onX.
  [Source](https://blog.caltopo.com/2025/02/27/more-lidar-plus-a-better-way-to-visualize-it/)
- **DeerCast (É-U)** — prévision de mouvement heure par heure sur 14
  jours ; fonction **"DeerCast Past"** : comparer jusqu'à 5 dates
  historiques côte à côte pour repérer des patrons. Idée d'interface
  concrète à retenir pour une future phase d'analytique historique.
  [Source](https://www.deercast.com/features/)
- **BaseMap (É-U)** — palier gratuit inclut le partage de position et
  l'intégration de couches Google Earth. Fonction **SmartMarkers** :
  capture automatiquement les conditions météo au moment/lieu exact de la
  création d'un waypoint — petite idée concrète et simple à ajouter à
  notre Phase 2.
  [Source](https://huntinglife.com/basemap-review/)
- **LandTrust (É-U)** — catégorie différente : marché de réservation
  d'accès à des terres privées de chasse ("Airbnb de la chasse"). Pas un
  outil de cartographie — mentionné seulement pour mémoire, hors périmètre
  probable du projet.
  [Source](https://landtrust.com/)
- **Gaia GPS / LandGlide** — outils généralistes (plein air / cadastre
  É-U) confirmant que le hors-ligne à couches multiples et les données de
  parcelle détaillées sont partout gardées derrière un palier payant —
  cohérent avec notre propre approche freemium implicite, rien de neuf à
  en tirer autrement.

### Synthèse — vraies nouvelles idées de cette recherche approfondie
1. **iHunter et BetterHunts existent déjà comme précédents québécois** —
   à étudier directement plutôt que d'extrapoler seulement depuis onX/
   HuntStand, surtout pour la philosophie "données publiques uniquement,
   jamais fabriquées" de BetterHunts qui rejoint notre propre règle.
2. **Partage hors ligne pair-à-pair de waypoints/marquages** (onX) —
   mécanisme distinct de la synchronisation cloud déjà prévue ; vraiment
   nouveau, pas juste une variante d'UI.
3. **Ombrage de terrain combiné façon CalTopo** (élévation+pente+aspect+
   couvert forestier) comme cible pour la Phase 4, plus riche qu'un simple
   outil d'élévation.
4. **Score de confiance de prédiction ("Patternability")** — s'intègre
   naturellement à notre `DataConfidence` existant, pour une future phase
   d'analytique/prévision (Phase 7-9).
5. **Capture météo automatique au moment de la création d'un waypoint**
   (BaseMap SmartMarkers) — petit ajout concret, candidat pour Phase 2.
6. **Vue de comparaison historique multi-dates** (DeerCast Past) — patron
   d'interface à retenir pour une future phase d'analytique historique.

Rien de ce qui précède n'est construit maintenant — notes de référence
uniquement, à reconsidérer phase par phase comme le reste de ce fichier.

---

## Recherche ciblée : waypoints, LiDAR, styles de carte — 2026-08-16

**Origine :** demande de creuser 3 axes précis non couverts en détail par
les deux rondes précédentes : (1) les catégories/icônes de waypoints
exactes de chaque app, (2) les couches LiDAR (lesquelles existent
vraiment, pas juste "imagerie haute résolution"), (3) les noms exacts des
styles de fond de carte offerts. Chaque fait ci-dessous a une source
vérifiée par recherche web ; **les points marqués "non vérifié" sont
explicitement signalés comme tels, jamais présentés comme un fait** — en
cohérence avec la règle du projet de ne jamais fabriquer de donnée.

### Axe 1 — Catégories/icônes de waypoints

- **onX Hunt** : le site officiel dit "près de 100 icônes" — un chiffre
  précis de 92 circule ailleurs mais **n'a pas pu être retracé à une
  source onX elle-même** (non vérifié, à traiter comme rumeur). Aucun
  regroupement par catégorie nommé n'existe — seulement des exemples par
  scénario de chasse (traverses de ruisseau, pincements de terrain,
  fientes, sites de gloussement d'orignal/wapiti, lignes de grattage de
  cerf). 10 couleurs disponibles pour coder par espèce/année.
  [Source](https://www.onxmaps.com/hunt/app/features/waypoints)
- **HuntStand** : **45 icônes**, regroupées en 4 catégories nommées —
  "Property Attributes" (ex. camp, barrière, danger), "Scouting" (ex.
  aire de couchage, fientes, grattage, sente, traverse), "Stands" (4
  icônes de mirador/plateforme) et "Others". Plus 5 types de lignes
  (routes, sentiers, chemins, clôtures, autre) et 5 types de formes
  (limites, parcelle agricole, sanctuaire, eau, autre) — distincts des
  icônes de point. 20+ couleurs.
  [Source](https://www.huntstand.com/fieldnotes/deer/a-detailed-guide-to-huntstand-app-tools-for-deer-hunters/)
- **iHunter** : aucun décompte ni catégorie publiés — waypoints
  supportent icône + photo + description + météo, taille d'icône
  ajustable, rien de plus trouvé sur la page officielle.
  [Source](https://www.ihunterapp.com/features/)
- **BetterHunts** : **n'a pas de système de waypoints du tout** — c'est un
  outil de cotes de tirage/statistiques/cartes de zones de gestion
  (WMU), pas une app de repérage. À noter pour corriger toute
  interprétation antérieure qui aurait pu le classer comme comparable à
  onX/HuntStand sur ce point précis — sa pertinence pour nous reste
  la philosophie "données publiques uniquement" notée précédemment, pas
  les waypoints. [Source](https://www.betterhunts.ca/)

### Axe 2 — Couches LiDAR (vérifié laquelle en a vraiment)

- **onX Hunt** — **confirmé**, palier Elite seulement (99,99 $/an) :
  relief ombré dérivé du LiDAR — révèle fossés, fonds de ruisseau,
  vieux chemins forestiers, replats, dépressions invisibles sur
  topo/satellite. Précision verticale annoncée ~10 cm. Couverture
  géographique exacte **non publiée** (page vague à ce sujet — non
  vérifié). Utilisable hors ligne seulement avec Elite.
  [Source](https://www.onxmaps.com/hunt/app/features/lidar-maps)
- **CalTopo** — **confirmé**, le plus transparent du groupe : couches
  "Normal/Enhanced Shaded Relief" + ombrage de pente haute résolution,
  basées sur le LiDAR USGS 3DEP (+ IfSAR en Alaska). **Carte de
  couverture interactive publique** montrant précisément où le LiDAR
  1 m ou mieux est disponible — seule app du groupe à publier ça
  ouvertement. [Source](https://blog.caltopo.com/2025/02/27/more-lidar-plus-a-better-way-to-visualize-it/)
- **Spartan Forge** — **confirmé** : "cartes LiDAR entièrement
  personnalisables" qui retirent la canopée pour montrer le sol nu —
  drainages, replats, vieux chemins de débardage. Couplé à un outil
  d'angle de pente. Couverture géographique **non détaillée** (non
  vérifié, probablement centré É-U).
  [Source](https://www.rokslide.com/spartan-forge-review/)
- **Gaia GPS** — **partiellement confirmé** : pas de couche "LiDAR"
  autonome nommée comme telle — le LiDAR (USGS 3DEP 1 m où disponible)
  alimente plutôt la couche "Slope Angle" (Premium). Une mention
  communautaire non officielle évoque une meilleure couverture au
  Vermont — **page inaccessible pour vérification, à traiter comme
  anecdotique seulement, pas comme fait**.
- **HuntStand, iHunter** — **aucune mention de LiDAR** trouvée sur leurs
  pages officielles.
- **BetterHunts** — non applicable (pas un outil de terrain/carte).

### Axe 3 — Styles de fond de carte (noms exacts)

- **onX Hunt** : Satellite, Topographic, Hybrid (satellite + courbes),
  **Leaf-Off Imagery** (Elite, sans feuillage, confirmé disponible dans
  21 états américains précis — pas le Québec), **Recent Imagery**
  (Elite, imagerie plus récente que la base), Mode 3D (relief extrudé
  sur n'importe quel fond).
  [Source](https://support.onxmaps.com/hc/en-us/articles/360052574531-Basemaps-3D-Mode-and-Imagery-Options)
- **HuntStand** : annonce "7 fonds de carte différents" mais **ne les
  nomme pas individuellement** publiquement — seule lacune qu'on n'a pas
  pu combler. Mentions qualitatives : satellite standard, palier
  "satellite premium", imagerie satellite mensuelle pour la fraîcheur.
  Mode 3D séparé aussi présent.
- **CalTopo** (le plus complet et le mieux nommé — bonne référence pour
  notre propre sélecteur de couches) : MapBuilder Topo (USGS+OSM+LiDAR),
  MapBuilder Hybrid, MapBuilder Imagery, MapBuilder Roads, Scanned Topos
  (cartes topo historiques numérisées), Forest Service FSTopo,
  OpenStreetMap, NAIP (agricole 1 m É-U), couches quasi temps réel
  réservées Pro+ (Sentinel hebdo, MODIS quotidien, GOES en direct/
  thermique), familles de relief ombré (Normal/Enhanced/Terrain
  Shading multi-angle).
  [Source](https://training.caltopo.com/all_users/base-layers/layers)
- **Gaia GPS** : Gaia Topo (fond phare mondial, gratuit), USGS Topo
  (quads officiels numérisés), Satellite Topo (hybride topo+satellite),
  MVUM (surcouche routes/sentiers forestiers officiels É-U par
  saisonnalité — pas un fond de carte en soi), Slope Angle (surcouche
  LiDAR/DEM). 250+ sources au total avec Premium.
- **iHunter** : 4 fonds nommés — Route, Topographique, Hybride,
  Satellite.
  [Source](https://www.ihunterapp.com/features/)

### Autres points relevés en passant (non approfondis)
- **onX Hunt** : dépôt de waypoint depuis une montre intelligente (Apple
  Watch/Pixel Watch) sans sortir le téléphone — axe de développement
  actif selon les forums, à surveiller.
- **HuntStand** : couches météo séparées des fonds de carte (radar,
  précipitations, neige, températures, feux, sécheresse).
- **CalTopo** : couches quasi temps réel (Sentinel/MODIS/GOES) qu'aucune
  app spécifiquement chasse n'offre — piste potentielle pour suivi
  fumée/feux/météo, à garder en tête.
- **DeerCast** : tous les types de couches (waypoints, parcelles, météo
  radar, distances, chemins sauvegardés, food plots) regroupés sous un
  seul bouton "couches" — patron d'UX compact à considérer pour notre
  propre sélecteur.

### Lacunes de vérification à ne jamais traiter comme des faits
1. Nombre exact d'icônes onX Hunt (92 non confirmé — "près de 100" est
   la seule formulation officielle).
2. Liste individuelle des 45 icônes HuntStand (seuls les 4 noms de
   groupe + exemples partiels sont publiés).
3. Nombre/catégories d'icônes iHunter — introuvable.
4. Noms des "7 fonds de carte" HuntStand — décompte confirmé, noms non
   publiés.
5. Couverture LiDAR Gaia GPS par état (mention Vermont non vérifiable).
6. Palier exact requis par couche CalTopo (seules les couches Google et
   temps réel sont confirmées Pro+).

Rien de ce qui précède n'est construit maintenant — notes de référence
uniquement.

---

## Rejeté après vérification

- **"Mettre en place un système de reprojection dès la Phase 1"**
  (WGS84 → Web Mercator manuellement) — techniquement incorrect pour ce
  contexte. MapLibre GL JS travaille nativement en lat/lng dans toute son
  API publique ; la projection vers Web Mercator est interne et
  transparente. Implémenter une reprojection manuelle ajouterait de la
  complexité pour un problème qui n'existe pas.
- **"Le composant Button doit accepter `leftIcon`/`rightIcon` et gérer
  des états `loading` dès maintenant, car on en aura besoin plus tard"**
  — contredit directement une règle explicite du projet
  ("Don't design for hypothetical future requirements" /
  "Don't add features... beyond what the task requires"). Ces props
  seront ajoutées quand une fonctionnalité réelle les demandera.
- **Deux nouvelles phases "0.5 Intégrité des données" et "0.6
  Permissions"** — les préoccupations sont valides mais déjà couvertes
  par la Phase 3 existante (gestion du stockage) et par l'implémentation
  naturelle du GPS (Phase 1) et de la caméra (Phase 12). Créer des phases
  numérotées séparées fragmente la roadmap sans bénéfice net.
- **Architecture formelle en 5 couches avec entités "Domain/Core"
  séparées de la couche "Application/Feature"** — plus lourd que les 4
  couches déjà documentées dans `ARCHITECTURE.md`. De la cérémonie
  disproportionnée pour la taille actuelle du projet ; à reconsidérer
  seulement si la complexité métier le justifie un jour.
