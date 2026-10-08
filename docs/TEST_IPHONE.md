# Essayer une branche sur l'iPhone, sans fusion et sans toucher à la production

**Statut : procédure vérifiée dans le code, non exécutée.** Le tunnel
(`cloudflared`) n'a jamais été lancé depuis l'environnement de travail. Seul le
filtrage d'hôtes de `vite preview` a été testé (voir plus bas).

## Pas d'URL d'aperçu automatique

Le déploiement GitHub Pages ne publie que `main` (`.github/workflows/deploy.yml`).
Un aperçu par branche demanderait de modifier ce déploiement ou d'ouvrir un compte
externe (Netlify, Vercel, Cloudflare Pages) : rien de tel n'a été fait.

## Ce que le code impose (vérifié)

| Sujet                             | Constat                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chemin à ouvrir                   | **`/`** (la racine de l'adresse du tunnel). `vite.config.ts` n'utilise `/CTR-HUNTING/` que si `GITHUB_PAGES=true` : **ne pas définir cette variable**, sinon l'app est construite pour `/CTR-HUNTING/`.                                                                                                                  |
| Hôtes acceptés par `vite preview` | `preview.allowedHosts: ['.trycloudflare.com']` : le domaine `trycloudflare.com` et ses sous-domaines seulement, pas tous les hôtes. Test local : `abc.trycloudflare.com` → 200 ; `evil.example.com` → 403 ; `trycloudflare.com.evil.com` → 403 ; `localhost` → 200.                                                      |
| Clés nécessaires                  | Deux seulement : `VITE_MAP_TILES_API_KEY` (MapTiler) et `VITE_ESRI_API_KEY` (Esri). Sans elles : carte « indisponible » explicite. Météo/vent (Open-Meteo) n'ont pas de clé. `VITE_WEATHER_API_KEY` etc. de `.env.example` ne sont pas lues par le code.                                                                 |
| Restrictions des clés             | **Non vérifiées.** Une clé limitée au domaine `github.io` sera refusée sur l'adresse du tunnel. Les clés sont **incluses dans le code construit** (visibles de quiconque ouvre l'adresse) : utiliser des clés de **test** dédiées, jamais celles de production. Esri : clé « Basemaps » seulement (voir `.env.example`). |
| Sécurité du contenu (CSP)         | L'adresse du tunnel est `'self'` ; seuls MapTiler, Esri, Open-Meteo, etc. de `build/csp.ts` sont autorisés.                                                                                                                                                                                                              |
| Confirmer la version              | L'application n'affiche pas le numéro de commit. Voir « Confirmer que c'est bien e65891e ».                                                                                                                                                                                                                              |

## Données : fictives seulement

L'adresse du tunnel est une **autre origine** : son stockage local (repères, traces,
sauvegardes, zones hors ligne) est séparé de celui de votre app habituelle et repart
de zéro à chaque nouveau tunnel. **N'importez aucune vraie donnée de chasse** dans cet
aperçu (ni restauration d'une vraie sauvegarde ZIP). Créez des repères et des traces
fictifs. Avant tout : faites une sauvegarde ZIP de votre app habituelle et gardez-la
ailleurs (Réglages › sauvegarde). L'aperçu est public pour quiconque connaît l'adresse :
ne la partagez pas.

## 1. Installer cloudflared (une fois)

PowerShell :

```powershell
winget install --id Cloudflare.cloudflared
```

Fermer puis rouvrir PowerShell, puis `cloudflared --version`. (Alternative : téléchargement
depuis https://github.com/cloudflare/cloudflared/releases.) Le tunnel « quick » ne demande
aucun compte, mais il **expose temporairement le serveur local sur Internet** via un service
externe de Cloudflare : à lancer seulement en le sachant.

## 2. Commandes PowerShell (depuis le dossier du dépôt, Node 24, voir `.nvmrc`)

```powershell
git fetch origin
git switch feat/refonte-visuelle-deertracker
git pull --ff-only
git status                      # doit dire : nothing to commit, working tree clean
git diff --stat e65891e HEAD    # vide, ou seulement des fichiers sous docs/
npm ci
```

Créer `.env.local` à la racine (ignoré par Git ; ne jamais le committer) avec des clés
**de test** :

```
VITE_MAP_TILES_API_KEY=<clé MapTiler de TEST>
VITE_ESRI_API_KEY=<clé Esri de TEST>
```

Puis construire et servir (ne pas définir `GITHUB_PAGES`) :

```powershell
Remove-Item Env:GITHUB_PAGES -ErrorAction SilentlyContinue
npm run build
npm run preview -- --port 4173 --strictPort
```

Dans une **seconde** fenêtre PowerShell, **seulement quand vous êtes prêt** :

```powershell
cloudflared tunnel --url http://localhost:4173
```

Il affiche une adresse `https://xxxx-xxxx.trycloudflare.com`.

## 3. Sur l'iPhone

Ouvrir dans Safari : **`https://xxxx-xxxx.trycloudflare.com/`** (la racine, pas
`/CTR-HUNTING/`). Autoriser la position. Ne pas « Ajouter à l'écran d'accueil » (l'adresse
disparaît à l'arrêt du tunnel).

## 4. Confirmer que c'est bien e65891e

1. Avant `npm run build` : `git status` propre et `git diff --stat e65891e HEAD` vide ou limité à `docs/` (le code est alors celui de e65891e ; seule la documentation a pu changer depuis).
2. L'app : Plus › À propos affiche « compilée le … » (UTC) : doit correspondre à l'heure
   de votre `npm run build` (ex. 15 h 30 à Montréal = 19 h 30 UTC en heure d'été).
3. Signes visibles de cette version : barre du bas Accueil / Carte / Mes données / Météo /
   Plus ; à droite de la carte, boutons « 2D » « 3D » et aucun zoom +/− ; page Plus ›
   Projet et progression ; Mes données › DeerTracker.

Cela prouve que le code construit est celui de e65891e seulement si l'étape 1 était vraie : c'est
une vérification par procédure, pas par empreinte dans l'application.

## 5. Erreurs possibles

| Symptôme                                      | Cause probable                                            | Correction                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| « Blocked request. This host is not allowed » | Adresse hors `*.trycloudflare.com`                        | Utiliser l'adresse `trycloudflare.com` donnée par `cloudflared`.                                                                       |
| Erreur 502 / 1033 du tunnel                   | `vite preview` arrêté, ou `localhost` résolu en IPv6      | Relancer `npm run preview -- --port 4173 --strictPort --host 127.0.0.1` et `cloudflared tunnel --url http://127.0.0.1:4173`.           |
| `Port 4173 is already in use`                 | Ancien aperçu encore actif                                | `Get-NetTCPConnection -LocalPort 4173` puis `Stop-Process -Id <PID>`, ou autre port (le changer aussi dans `cloudflared`).             |
| Page blanche, fichiers 404                    | Construit avec `GITHUB_PAGES=true` (base `/CTR-HUNTING/`) | `Remove-Item Env:GITHUB_PAGES`, puis `npm run build`.                                                                                  |
| Carte vide ou « indisponible »                | Clés absentes ou refusées (restriction de domaine, quota) | Vérifier `.env.local`, **reconstruire** (les clés sont lues à la construction), utiliser des clés de test sans restriction de domaine. |
| Position refusée                              | Permission iOS                                            | Réglages › Safari › Position, ou autoriser à la demande.                                                                               |
| Ancienne version affichée                     | Cache / service worker d'une ancienne adresse             | Utiliser le nouveau tunnel (nouvelle origine) ; sinon Réglages › Safari › Avancé › Données de sites web.                               |
| `npm ci` échoue                               | Mauvaise version de Node                                  | `node --version` (Node 24) ; installer la bonne version.                                                                               |

## 6. Arrêter

- Tunnel : dans sa fenêtre, `Ctrl+C`. Vérifier : `Get-Process cloudflared` ne doit rien renvoyer ; sinon `Stop-Process -Name cloudflared`.
- Aperçu : dans sa fenêtre, `Ctrl+C`. Sinon : `Get-NetTCPConnection -LocalPort 4173` puis `Stop-Process -Id <PID>`.
- Supprimer `.env.local` et **révoquer ou supprimer les clés de test**.
- Revenir à votre branche : `git switch main`.

## Hors ligne

Le tunnel doit rester ouvert pour la première visite ; le test hors ligne se fait ensuite
en coupant le **réseau de l'iPhone** (voir `docs/VALIDATION.md`), pas le tunnel.

## Autre méthode : tester après fusion

Fusion par vous seul, déploiement par le workflow, puis checklist sur le site réel.
Retour arrière : `git revert` du commit de fusion.
