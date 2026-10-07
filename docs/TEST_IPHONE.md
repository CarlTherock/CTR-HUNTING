# Tester cette branche sur l'iPhone, sans fusion dans `main`

## Aperçu automatique : non disponible

Il n'y a **pas d'URL d'aperçu** pour cette branche. Le déploiement GitHub Pages
du projet publie uniquement `main` (`.github/workflows/deploy.yml`), et un
aperçu par branche exigerait soit de modifier le déploiement de production, soit
d'ouvrir un compte sur un autre service (Netlify, Vercel, Cloudflare Pages) :
je n'ai fait ni l'un ni l'autre. Aucune clé ni donnée n'a été publiée.

## Méthode : construire sur le PC et ouvrir par un tunnel HTTPS temporaire

L'iPhone exige HTTPS pour le GPS et le service worker : une adresse
`http://192.168…` sur le Wi-Fi ne permet **pas** de les tester. Un tunnel
« quick tunnel » Cloudflare donne une adresse HTTPS temporaire.
(Cette méthode n'a pas pu être exécutée dans l'environnement de travail ; la
partie `vite preview` et le filtrage d'hôte ont, eux, été vérifiés.)

À faire sur le PC Windows, dans PowerShell, avec Node 24 (voir `.nvmrc`) :

1. `git fetch origin`
2. `git switch fix/audit-mobile-offline-gps`
3. `npm ci`
4. Créer le fichier **`.env.local`** à la racine (ignoré par Git, ne jamais le
   committer) :
   ```
   VITE_MAP_TILES_API_KEY=<clé MapTiler de TEST>
   VITE_ESRI_API_KEY=<clé Esri de TEST>
   ```
5. `npm run build` puis `npm run preview -- --port 4173`
   (sans `GITHUB_PAGES`, l'app est servie à la racine `/`).
6. Dans un second terminal : `cloudflared tunnel --url http://localhost:4173`
   (installer `cloudflared` au préalable). Il affiche une adresse
   `https://….trycloudflare.com`.
7. Ouvrir cette adresse dans Safari sur l'iPhone.
8. À la fin : fermer le tunnel (Ctrl+C) et **supprimer ou révoquer les clés de
   test**.

### Points d'attention

- **Clés restreintes par domaine.** Si les clés MapTiler/Esri de production sont
  limitées au domaine `github.io`, elles seront refusées sur l'adresse du
  tunnel (carte vide ou repli affiché par l'app). Utiliser des **clés de test**
  créées dans les consoles des fournisseurs, et ne pas élargir les restrictions
  des clés de production. Je n'ai pas vérifié ces restrictions.
- **L'adresse du tunnel est publique** pour quiconque la connaît : ne pas la
  partager, fermer le tunnel après le test.
- **Les données de test sont séparées** : l'adresse du tunnel est une autre
  origine que `github.io`, donc elle a son propre stockage local (points de
  repère, traces, zones hors ligne). Les données de la version déployée ne sont
  ni lues ni modifiées. Chaque nouvelle adresse de tunnel repart de zéro.
- **Hors ligne** : le tunnel doit rester ouvert pour la première visite ; le
  test hors ligne se fait ensuite en coupant le **réseau de l'iPhone** (voir
  `docs/VALIDATION.md`), pas le tunnel.
- L'installation « Sur l'écran d'accueil » depuis une adresse de tunnel
  temporaire n'est pas représentative de la version finale : elle disparaît
  quand l'adresse change. Pour tester la PWA installée, il faut la version
  déployée après fusion.

## Autre méthode : tester après fusion

Si tu préfères ne pas utiliser de tunnel : fusionner la PR (toi seul), laisser
le workflow de déploiement publier, puis exécuter la liste de vérification
iPhone du rapport sur le site réel. Le retour arrière se fait par
`git revert` du commit de fusion.
