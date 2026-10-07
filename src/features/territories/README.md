# features/territories

Organisation par **territoire** : des dossiers purement logiques pour classer
les points de repère, les traces et les entrées de journal.

**Un territoire n'a aucune limite géographique** (ni polygone, ni rectangle) :
c'est un nom, des notes et des dates. Rien n'est calculé à partir de la
position.

## Données

- `Territory` (`src/types/territory.ts`) : `id`, `name`, `createdAt`,
  `updatedAt`, `archivedAt?`, `notes?`.
- `territoryId?` optionnel sur `Waypoint`, `Track` et `Observation`. Absent =
  « Non classé » (toutes les données créées avant cette fonction).
- Dexie **version 5** (`src/database/db.ts`) : table `territories` + index
  `territoryId` sur `waypoints`, `tracks`, `observations`. Migration purement
  additive, sans `upgrade()` : aucun enregistrement n'est réécrit. Testée sur
  une vraie base v4 ouverte puis mise à niveau (`migrationV5.test.ts`).
- `src/database/territoriesRepository.ts` : CRUD, comptage du contenu et
  `deleteTerritoryKeepingContent` (une seule transaction : le dossier disparaît
  ET son contenu passe à « Non classé », sinon rien ne change).

## Comportement

- **Filtre** (`filter.ts`, `state/territoriesStore.ts`) : Tous / chaque
  territoire non archivé / Non classé / Archivés. Un seul filtre partagé par la
  page Points de repère (waypoints ET traces), le Journal et la carte. Il est
  enregistré dans `settings` (`territoryFilter`, erreurs de stockage ignorées) ;
  un filtre périmé (territoire supprimé ou archivé) redevient « Tous ».
- **Territoire actif** : le territoire choisi comme filtre. Les nouveaux
  waypoints (présélection modifiable dans le formulaire), traces et entrées de
  journal y sont classés ; sinon « Non classé ».
- **Carte** : seuls les waypoints du filtre sont dessinés. Si le filtre en
  masque, un bouton « N élément(s) masqué(s) par le filtre · Tout afficher »
  reste visible. Les traces enregistrées ne sont pas dessinées sur la carte
  (seul l'enregistrement en cours l'est, et il n'est jamais filtré).
- **Archiver** masque le territoire des sélecteurs actifs sans rien supprimer ;
  un élément déjà classé dans un territoire archivé continue de l'afficher
  « (archivé) » dans son sélecteur.
- **Supprimer** : confirmation explicite (nombre d'éléments par type), le
  contenu est **déplacé vers « Non classé »**. La suppression des données
  elles-mêmes n'est pas offerte. La confirmation est portée par le store
  (`requestDelete` / `confirmDelete`), pas seulement par l'interface.
- Affecter un territoire ne modifie jamais les coordonnées d'un waypoint
  (verrouillage inchangé).

## Interface

- `components/TerritoryManager.tsx` : créer, renommer, archiver/restaurer,
  supprimer ; ligne « Non classé » toujours présente. Ouvert depuis la page
  Points de repère (bouton « Gérer les territoires ») : aucune entrée de
  navigation ajoutée.
- `components/TerritoryFilterBar.tsx`, `TerritorySelect.tsx`,
  `TerritoryMapControl.tsx` (outil « Territoire » de la carte),
  `HiddenByFilterNotice.tsx`.
- Les autres stores (`waypointsStore`, `tracksStore`, `journalStore`) lisent le
  territoire actif et s'enregistrent via `onTerritoryDeleted` pour refléter en
  mémoire le déplacement vers « Non classé » (pas de dépendance circulaire).

## Limites connues

- Pas de limite géographique ni de classement automatique par position.
- Le panneau « Comparaison des vents » de la page Points de repère n'est pas
  filtré par territoire.
- Pas d'affectation en lot ; chaque élément se classe individuellement.
