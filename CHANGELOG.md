# Changelog

All notable changes to this project are documented here, grouped by
roadmap phase (see `PROJECT_SPECIFICATION.md`).

## Phase 1 — Map, slice 1.1: base map (2026-08-15)

Interactive base map only — pan/zoom on a MapTiler "Outdoor" style. No
layer manager, GPS, additional layers, or 2D/3D scaffold yet (slices
1.2–1.5, separate and not started).

### Added

- `maplibre-gl` and `zustand` dependencies (see `ARCHITECTURE.md` §
  Decisions log for why)
- `src/services/map/MapProvider.ts` — the adapter interface; no code outside
  `src/services/map/` may import `maplibre-gl` directly
- `src/services/map/MapTilerProvider.ts` — concrete implementation using
  MapLibre GL JS + MapTiler's "Outdoor" style
- `src/services/map/index.ts` — exports the configured `mapProvider`
  instance, `null` when `VITE_MAP_TILES_API_KEY` is unset
- `src/features/map/state/mapStore.ts` — zustand store for the shared map
  viewport (center/zoom/pitch/bearing)
- `src/types/map.ts` — `MapViewState`
- `MapPage` now renders a real interactive map when configured, and an
  explicit "Map unavailable" state (not a broken map) when it isn't
- `VITE_MAP_TILES_API_KEY` documented in `.env.example`

### Fixed

- `vite.config.ts`: excluded `maplibre-gl` from the dev-server dependency
  optimizer — its web worker isn't pre-bundled correctly by Vite's esbuild
  optimizer in dev mode (`maplibre-gl-worker.mjs` fails to resolve), which
  left the map blank with no console error. Production builds (Rollup)
  were never affected. Found by manually verifying the map in a browser
  with a real MapTiler key, not by the automated test suite (which mocks
  the map engine) — a reminder that "tests pass" isn't "the feature works."

### Known limitations

- No layer manager, live GPS, trail/hydrography/contour layers, or 3D yet —
  each is its own upcoming slice/phase
- Requires a real MapTiler API key in `.env` to render tiles; without one,
  the page shows the unavailable state by design (never fabricated data)
- Viewport is not yet persisted across sessions
- Production bundle with a real map key exceeds Vite's 500 KB chunk-size
  warning (~1.3 MB, MapLibre GL JS dominates); route-based code-splitting
  is deferred until more features exist to split around, per the existing
  Phase 0 bundle-size decision

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
