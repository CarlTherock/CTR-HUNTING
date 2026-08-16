# Field Terrain Intelligence

Offline-first Progressive Web App for terrain mapping, navigation,
environmental awareness, field observation and spatial analysis.

> **Status:** Phase 0 — Foundation. This is the application shell and
> architecture only; no map, GPS, weather or other field features are
> implemented yet. See `PROJECT_SPECIFICATION.md` for the full roadmap and
> `ARCHITECTURE.md` for how the codebase is organized.

## Requirements

- Node.js 18+
- npm

## Getting started

```bash
npm install
cp .env.example .env   # not required for Phase 0 — no external APIs are called yet
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

## Documentation

- [`PROJECT_SPECIFICATION.md`](./PROJECT_SPECIFICATION.md) — product vision, 17-phase roadmap, hard rules
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — implemented architecture, directory layout, decisions log
- [`CHANGELOG.md`](./CHANGELOG.md) — what shipped in each phase
