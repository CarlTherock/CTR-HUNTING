# Field Terrain Intelligence

Offline-first Progressive Web App for terrain mapping, navigation,
environmental awareness, field observation and spatial analysis.

> **État :** application fonctionnelle (carte, GPS, points de repère, traces,
> hors ligne, météo/vent, analyse). Voir `PROJECT_SPECIFICATION.md` pour la
> feuille de route, `ARCHITECTURE.md` pour l'organisation du code et
> `docs/VALIDATION.md` pour ce qui est réellement testé (et ce qui ne l'est pas).

## Requirements

- Node.js 22.12+ (Node 24 recommandé, voir `.nvmrc`)
- npm

## Getting started

```bash
npm install
cp .env.example .env   # clés publiques de fonds de carte (MapTiler/Esri) ; jamais de secret ici
npm run dev
```

The dev server prints a local URL (typically `http://localhost:5173`).

## Scripts

| Command                | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                           |
| `npm run build`        | Type-check and build a production bundle to `dist/` |
| `npm run preview`      | Serve the production build locally                  |
| `npm run typecheck`    | TypeScript project check, no emit                   |
| `npm run lint`         | ESLint                                              |
| `npm run lint:fix`     | ESLint with autofix                                 |
| `npm run format`       | Prettier, write mode                                |
| `npm run format:check` | Prettier, check-only (CI-friendly)                  |
| `npm run test`         | Run the test suite once (Vitest)                    |
| `npm run test:watch`   | Run tests in watch mode                             |
| `npm run test:ui`      | Run tests with the Vitest UI                        |
| `npm run e2e:install`  | Install Chromium for Playwright                     |
| `npm run e2e`          | E2E tests (Chromium, simulated map provider)        |

Before considering any change complete, all of `typecheck`, `lint`, `test`
and `build` must pass.

## Tech stack

React 19, TypeScript (strict), Vite, Tailwind CSS v4, React Router,
Dexie (IndexedDB), Vitest + Testing Library, `vite-plugin-pwa` (Workbox).
See `ARCHITECTURE.md` for the reasoning behind each choice.

## Project structure

See `ARCHITECTURE.md` for the full, documented layout. In short: a
feature-oriented `src/features/`, shared `src/components/`, domain
`src/types/`, local persistence in `src/database/`, and external-API
adapters (none yet) in `src/services/`.

## Écrans de finition produit

- Accueil terrain (`/`) : météo et vent réels ou « indisponible », carte, guidage, territoire, journal, cartes hors ligne, état des données.
- Aide (`/help`), Confidentialité (`/privacy`) et À propos (`/about`) : accessibles depuis Réglages, hors de la barre principale.
- Présentation de 4 écrans au premier lancement (sans permission), rejouable depuis Réglages.
- Comptes, abonnement et paiement : non disponibles / reportés.

## Documentation

- [`PROJECT_SPECIFICATION.md`](./PROJECT_SPECIFICATION.md) — product vision, 17-phase roadmap, hard rules
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — implemented architecture, directory layout, decisions log
- [`docs/VALIDATION.md`](./docs/VALIDATION.md) — périmètre réel des tests
- [`docs/SECURITY.md`](./docs/SECURITY.md) — CSP, dépendances, CI
- [`docs/WIND_ANALYSIS.md`](./docs/WIND_ANALYSIS.md) — analyse du vent sur la carte : source, résolution horaire, synchronisation, limites
- [`CHANGELOG.md`](./CHANGELOG.md) — what shipped in each phase
