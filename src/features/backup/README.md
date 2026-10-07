# features/backup

**Statut :** fonctionnel. Export/import GPX et sauvegarde/restauration complète en fichier, sans nuage ni compte.
La synchronisation (phase 15) n'est **pas** livrée : voir `docs/SYNC_PREPARATION.md`.

- `engine/` : `backupCreate` (ZIP via `fflate`, import dynamique), `backupRead` (vérifications), `validate`,
  `restorePlan` (aperçu, lecture seule), `restoreApply` (une transaction Dexie). Prennent un `Dexie` en paramètre.
- `gpx/` : `gpxExport`, `gpxImport` (pur), `gpxService` (base de données).
- `state/` : stores zustand qui orchestrent, progression et annulation (`AbortController`), rechargement des stores
  de données après restauration/importation.
- `components/` : `DataBackupSection` (chargé paresseusement par Réglages), `RestoreViews`, `GpxViews`,
  `BackupReminder` (réutilisable ; le tableau de bord le monte ; nécessite un `Router`).
- `backupReminder.ts` : `backupReminderState(now, lastBackupAt, counts)` (pure).

Pas de Web Worker : les photos sont stockées sans compression, le travail est découpé en tranches d'environ 12 ms
avec progression et annulation (`core/tasks.ts`). Les limites de mémoire d'un iPhone restent réelles pour de très
grosses archives (le fichier est lu en mémoire à la restauration ; limite 1 Go).

iOS : le téléchargement par `<a download>` peut être ignoré dans l'app installée ; l'interface garde les boutons
« Télécharger » et « Partager / Enregistrer dans Fichiers » (feuille de partage, iOS 15+). Non vérifié sur appareil réel.

Tests : `engine/backup.test.ts` (environnement Node, vrais Blob), `gpx/gpx.test.ts`, `components/backupUi.test.tsx`.
Format et doublons : `docs/BACKUP_FORMAT.md`.

À brancher après fusion avec les territoires : recharger le store des territoires dans `reloadDataStores`
(`state/backupStore.ts`).
