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
