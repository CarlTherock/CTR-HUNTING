# Format de sauvegarde et politique de restauration

Fichier : `ctr-hunting-sauvegarde-AAAA-MM-JJ-HHMM.zip`. Code : `src/features/backup/`.

## Pourquoi un ZIP (et fflate) plutôt que JSON + base64

|                   | JSON + base64                                                                    | ZIP (retenu)                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Taille des photos | +33 % (base64)                                                                   | octets d'origine, aucune inflation                                                                                        |
| Mémoire           | tout en une chaîne géante (JSON.stringify de dizaines de Mo : gel, plantage iOS) | une photo à la fois à l'écriture ; vues sans copie à la lecture                                                           |
| Intégrité         | à inventer                                                                       | longueur + CRC-32 par fichier dans le manifeste, en plus du répertoire central du ZIP (une archive tronquée est détectée) |
| Outillage         | —                                                                                | le fichier s'ouvre avec n'importe quel outil ZIP : l'utilisateur peut y retrouver ses photos même sans l'application      |

Dépendance ajoutée : **fflate** 0.8.x (MIT, sans dépendance). Environ 8 ko gzip pour la partie utilisée ; la
bibliothèque est chargée par `import('fflate')` uniquement quand l'utilisateur sauvegarde ou restaure (chunk séparé,
absent du chargement initial). Les photos (déjà compressées) sont **stockées** sans recompression ; seuls les JSON sont
compressés (deflate).

## Contenu

```
manifest.json            version de format, version de l'app, date, comptes, longueur + CRC-32 de chaque fichier
data/territories.json    (si la base a la table territories)
data/waypoints.json      coordonnées EXACTES (nombres JSON, aller-retour identique)
data/tracks.json         points, pauses, interruption, statut… : l'enregistrement entier, champs inconnus compris
data/observations.json
data/photos.json         métadonnées + chemins des fichiers (voir ci-dessous)
data/offlineAreas.json   métadonnées seulement (voir limites)
data/settings.json       préférences connues seulement
media/photos/000001.bin            blob affiché
media/photos/000001.original.bin   originalBlob, présent seulement s'il diffère de blob
```

Les enregistrements sont écrits tels quels (sans réécriture de schéma) : un champ ajouté plus tard par une autre
fonctionnalité (par exemple `status`, `pauses`, `territoryId`) survit à l'aller-retour sans que le moteur le connaisse.
Les relations (`waypointId`, `observationId`, `photoIds`, `territoryId`) sont conservées par identifiant.

### Ce qui n'est PAS sauvegardé

- **Tuiles de cartes hors ligne** : seules les métadonnées des zones (nom, étendue, zooms, fond) le sont. À la
  restauration, ces zones apparaissent « interrompues », sans tuile : l'utilisateur les retélécharge (« Réessayer »).
- **`syncQueue`** : jamais écrite ni restaurée.
- **Réglages** : liste blanche (`BACKUP_SETTING_KEYS` : aujourd'hui `fieldModeEnabled`). Cache météo, `lastBackupAt`,
  rappel, et toute clé inconnue ou ressemblant à un secret sont exclus. Aucune clé d'API ne figure dans une archive.
- Un test échoue si une table Dexie n'est ni sauvegardée ni explicitement exclue.

## Versions

- `schemaVersion` (entier ≥ 1, actuellement **1**) est la version du _format d'archive_, indépendante de la version
  Dexie (`databaseVersion`, informative).
- Version **supérieure** à celle que le lecteur connaît, absente, non entière ou < 1 → refus clair, aucune écriture.
- On ne change `schemaVersion` que pour une modification qu'un ancien lecteur interpréterait mal ; un champ ajouté ne
  l'exige pas. Une archive plus ancienne reste lisible : champs optionnels manquants acceptés, `updatedAt` absent =
  `createdAt`, `notes` absentes d'une observation = chaîne vide, tables absentes = rien à restaurer.
- Une archive contenant `territories` restaurée dans une base sans cette table : ces éléments sont comptés « non pris
  en charge » (sans erreur), le reste est restauré et les champs `territoryId` sont conservés.

## Restauration en trois temps

1. **Lecture et vérification (aucune écriture)** : signature ZIP, limites de taille (1 Go d'archive, 256 Mo par fichier,
   100 000 entrées), manifeste, version, présence + longueur + CRC-32 de chaque fichier listé, comptes. Échec →
   « fichier corrompu / incomplet / altéré / version plus récente ».
2. **Plan (lecture seule) et aperçu** : chaque élément est validé (identifiant, coordonnées finies, lat ±90, lng ±180,
   dates, types) puis comparé à la base locale. L'aperçu affiche pour chaque type : nouveaux / identiques / conflits /
   invalides, la date et la version de la sauvegarde, et les limites.
3. **Confirmation explicite**, puis écriture dans **une seule transaction Dexie**. Une erreur à n'importe quel moment
   annule tout (aucune demi-restauration). Jamais de suppression préalable, jamais de `put` : uniquement des ajouts,
   donc une collision d'identifiant imprévue fait échouer la transaction plutôt qu'écraser quoi que ce soit.

## Politique des doublons et des identifiants

| Cas                                                                                   | Résultat                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| même id, contenu identique                                                            | **ignoré** (compté « identiques »)                                                                                                                                                                                                                                                                                           |
| même id, contenu différent                                                            | **conflit** : l'élément local est conservé tel quel. Défaut : la version de la sauvegarde est ignorée et listée dans le rapport. Si l'utilisateur choisit « Ajouter aussi les versions de la sauvegarde » dans l'aperçu : copie avec **nouvel id**, nom suffixé « (importé) » (observations : « (importé) » en fin de notes) |
| id absent localement                                                                  | **ajouté** (id conservé)                                                                                                                                                                                                                                                                                                     |
| invalide (coordonnées hors plage, champ requis manquant, id en double dans l'archive) | **invalide** : rapporté, jamais importé                                                                                                                                                                                                                                                                                      |
| photo sans parent (ni dans l'archive ni localement), ou ayant deux parents / aucun    | **invalide**                                                                                                                                                                                                                                                                                                                 |
| table inconnue de cette version                                                       | **non pris en charge**                                                                                                                                                                                                                                                                                                       |
| réglage de même clé, valeur différente                                                | conflit : le local est toujours conservé (pas de copie possible)                                                                                                                                                                                                                                                             |

« Identique » = même contenu après normalisation (ordre des clés et champs `undefined` ignorés) ; pour une photo :
mêmes métadonnées **et** mêmes octets de `blob` et de `originalBlob`. Pour une zone hors ligne, seuls nom, étendue, zooms,
fond et date de création comptent (l'état de téléchargement est propre à l'appareil).

Quand une copie est créée pour un parent en conflit, ses enfants **nouveaux** de la sauvegarde la suivent
(`waypointId`, `observationId`, `territoryId`, `photoIds` réécrits). Les enfants identiques restent ignorés, les enfants
d'un parent conservé en local restent rattachés à ce parent. Les coordonnées d'un point de repère existant ne sont
jamais modifiées.

Les observations dont `waypointId` (ou `territoryId`) ne correspond plus à rien sont importées telles quelles : c'est un
état légitime de l'application (supprimer un point de repère ne supprime pas le journal).

## GPX (échange, pas sauvegarde)

GPX 1.1 : `<wpt>` (ele, time, name, desc, sym, type), `<trk><trkseg><trkpt>` (ele, time). Les données propres à l'app
(id, catégorie, couleur, territoire, précision, vents favorables, dates de début/fin) sont dans `<extensions>` sous
l'espace de noms `https://carltherock.github.io/CTR-HUNTING/ns/gpx/1` (préfixe `ctr:`), ignoré par les lecteurs tiers.
Export : tout, un territoire, un point de repère, une trace. Pas inclus : photos, journal, zones hors ligne, champs de
trace hors liste (pauses, statut) : utiliser la sauvegarde .zip. Les caractères interdits en XML 1.0 sont retirés du texte.

Import : `DOMParser` en `application/xml` (jamais HTML), valeurs lues par `textContent`/`getAttribute`, rien dans
`innerHTML`. Refusés d'emblée : > 10 Mo, > 10 000 points de repère, > 500 000 points de trace, DOCTYPE/ENTITY, XML mal
formé ou non GPX. Chaque coordonnée est validée (finie, lat ±90, lng ±180) ; les points invalides sont ignorés et comptés.
Les `<rte>` sont ignorés (signalé). Heures manquantes : date d'importation (points de repère) ou heure de début de trace
(points de trace) — signalé, vitesse et durée alors non fiables. Un id du fichier n'est réutilisé que s'il est sûr
(`[A-Za-z0-9_-]`, ≤ 64) et libre ; un élément déjà présent (même nom et mêmes coordonnées / même nom, début et nombre de
points) est ignoré. Rien n'est jamais écrasé. Un territoire inconnu localement est abandonné (compté).
