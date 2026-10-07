# Sécurité

## Clés de fournisseurs (publiques par conception)

L'application est 100 % statique (GitHub Pages) : toute variable `VITE_*`
est **incluse dans le JavaScript livré** et donc lisible par n'importe qui.
Les clés MapTiler (`VITE_MAP_TILES_API_KEY`) et Esri (`VITE_ESRI_API_KEY`)
ne sont donc **pas des secrets** ; leur protection repose uniquement sur
des restrictions configurées chez le fournisseur.

**À configurer manuellement (non vérifié depuis le dépôt, aucun accès aux consoles) :**

- MapTiler → _Account → Keys_ : restreindre la clé aux origines HTTP
  `https://carltherock.github.io` (et `http://localhost:*` pour une clé de
  développement séparée), régler un quota/alerte de consommation.
- Esri / ArcGIS Location Platform → clé limitée au privilège **Basemaps**
  uniquement, restreinte au référent `https://carltherock.github.io/*`.
- Ne jamais mettre de clé _service-role_, jeton privé ou mot de passe dans
  le frontend. Les secrets GitHub (`secrets.VITE_*`) servent uniquement à
  injecter ces clés publiques au build.

## Content-Security-Policy

Le build de production injecte une balise `<meta http-equiv>` (source :
`build/csp.ts`, test : `src/app/csp.test.ts` + `e2e/csp.spec.ts`).

Limites connues, inhérentes à GitHub Pages (pas d'en-têtes HTTP) :

- `frame-ancestors`, `report-uri` et `sandbox` sont ignorés dans une balise meta ;
  la protection anti-clickjacking n'est donc pas assurée.
- Pas de mode _Report-Only_ : une règle trop stricte bloque réellement.
- `style-src 'unsafe-inline'` est nécessaire (attributs `style` de React et
  de MapLibre). Aucun script inline, aucun `eval`.
- La liste d'hôtes est celle des appels réels du code. **Non vérifiée en
  direct** contre les vrais services MapTiler/Esri (E2E : backend simulé).
  Si un nouveau fournisseur est ajouté, il faut l'ajouter à `build/csp.ts`.
- Le serveur de développement n'applique pas la CSP (HMR).

## Dépendances et CI

- `npm audit --omit=dev --audit-level=high` s'exécute dans la CI.
- Dependabot (`.github/dependabot.yml`) surveille npm et GitHub Actions.
- La CI de validation (`ci.yml`) n'utilise aucun secret et un jeton en
  lecture seule ; le déploiement (`deploy.yml`) est séparé et seul le job
  `deploy` a les permissions Pages.
