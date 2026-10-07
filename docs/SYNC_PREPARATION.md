# Préparation de la synchronisation (phase 15)

**La synchronisation n'est PAS livrée.** Aucun écran de compte, de connexion ou de synchronisation n'existe, par choix.

## Constat (vérifié dans le dépôt)

- Aucun backend opérationnel : pas de client Supabase ni d'autre SDK, aucune URL d'API appelée par le code. La seule
  trace est la variable commentée `VITE_SYNC_API_BASE_URL` dans `.env.example` (aucun code ne la lit) et la mention
  « backend planifié, phase 15 » dans `PROJECT_SPECIFICATION.md`.
- `syncQueue` existe dans Dexie (`id`, `entity`, `entityId`, `operation`, `queuedAt`) mais **rien ne l'alimente ni ne la
  consomme**. Elle n'est pas sauvegardée ni restaurée.
- Rien n'a été créé ni modifié côté serveur ou compte.

## Ce qui reste à décider ou à fournir

1. **Backend** : fournisseur (Supabase/PostgreSQL+PostGIS, ou API propre), région de données (résidence au Québec/Canada ?),
   coûts, URL du projet. Aucun n'est choisi.
2. **Authentification** : méthode (courriel + lien magique, OAuth), gestion de session hors ligne, récupération de compte.
3. **Autorisations (RLS)** : un utilisateur ne lit/écrit que ses lignes ; partage éventuel (territoires partagés ?) ;
   politique pour les photos (stockage d'objets, URL signées, taille maximale).
4. **Modèle distant** : tables miroir de `waypoints`, `tracks`, `observations`, `photos` (objets), `territories`, avec
   géométrie PostGIS ; stratégie de suppression (pierres tombales).
5. **Résolution de conflits** : « dernier écrit gagne » est inacceptable pour les coordonnées de points verrouillés.
   À trancher : dernier `updatedAt` par champ, ou conflit présenté à l'utilisateur (la politique de la restauration —
   conserver le local, copie nommée — est un point de départ).
6. **Usage de `syncQueue`** : une ligne par écriture locale (création/modification/suppression) écrite dans la même
   transaction Dexie que la donnée, vidée après accusé du serveur, avec reprise et ordre garanti ; limite de tentatives.
7. **Identifiants / versions** : les ids sont déjà des UUID v4 générés côté client (sûrs pour créer hors ligne). Il manque
   un `updatedAt` sur les traces, observations, photos et zones (les points de repère l'ont), et idéalement un
   compteur de révision par enregistrement pour détecter les écritures concurrentes.
8. **Photos** : envoi différé, reprise, compression, et quotas.
9. **Chiffrement et vie privée** : coordonnées de chasse = données sensibles ; chiffrement de bout en bout ou non ?

## Ce que le format de sauvegarde prépare

- Des identifiants stables et des relations par id (`waypointId`, `observationId`, `photoIds`, `territoryId`) conservés.
- Une politique de doublons déterministe (identique / conflit / nouveau) réutilisable comme base de fusion.
- Un `schemaVersion` explicite et des enregistrements transportés sans perte des champs inconnus.
- Des manifestes avec comptes et empreintes, utiles pour vérifier une reprise.

Ce que la sauvegarde ne fait **pas** : aucune fusion bidirectionnelle, aucun suivi des suppressions, aucune
synchronisation incrémentale. C'est une copie complète, manuelle, que l'utilisateur doit conserver lui-même.
