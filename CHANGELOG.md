# Changelog

All notable changes to this project are documented here, grouped by
roadmap phase (see `PROJECT_SPECIFICATION.md`).

## Phase 0 — Foundation (2026-08-15)

Initial production-ready foundation. No user-facing feature (map, GPS,
weather, ...) is implemented — this phase establishes the application
shell and architecture everything else is built on.

### Added

- Vite + React 19 + TypeScript (strict) project setup
- Tailwind CSS v4 design system foundation (dark-first palette, tokens in
  `src/index.css`)
- PWA support via `vite-plugin-pwa` (installable, offline app-shell caching)
- ESLint (flat config, typescript-eslint strict+stylistic) + Prettier
  (with `prettier-plugin-tailwindcss`)
- Vitest + Testing Library + `fake-indexeddb` test setup
- Feature-oriented folder structure under `src/features/` for all 17
  roadmap phases (functional: `dashboard`, `settings`; placeholder pages:
  `map`, `waypoints`, `weather`, `analytics`, `journal`; README-only:
  `layers`, `gps`, `tracks`, `offline`, `terrain`, `wind`, `astronomy`,
  `camera`, `photos`, `observations`, `history`, `ai`)
- Responsive app shell: desktop/tablet sidebar, mobile top bar + bottom
  navigation, both driven by a single navigation config
- Design-system primitives: `Button`, `Card`, `Badge`, `EmptyState`,
  `PageHeader`, `PhasePlaceholder`
- Shared domain types: `Coordinate`, `Waypoint`, `Track`, `TrackPoint`,
  `WeatherSnapshot`, `WindSnapshot`, `AstronomySnapshot`, `Observation`,
  and `DataConfidence`/`DataPoint<T>` to enforce the project's data-quality
  rule (measured / calculated / estimated / AI interpretation / user
  observation) at the type level
- Offline architecture groundwork: Dexie local database (`waypoints`,
  `tracks`, `observations`, `settings`, `syncQueue` tables), a
  `settingsRepository`, and a reactive `useOnlineStatus` hook — no map
  tile downloading yet (explicitly deferred to Phase 3)
- Project documentation: `PROJECT_SPECIFICATION.md`, `ARCHITECTURE.md`,
  `README.md`, `.env.example`

### Removed

- Default Vite React template demo (counter, logos) and its `oxlint` setup
  (project instructions specify ESLint + Prettier)

### Known limitations

See `ARCHITECTURE.md` § Known limitations.
