# Changelog

All notable changes to this project are documented here, grouped by
roadmap phase (see `PROJECT_SPECIFICATION.md`).

## Phase 1 — Map, slice 1.2: layer manager (2026-08-15)

Base layer switching only — Outdoor (topo, the slice 1.1 default) and
Satellite, both real MapTiler styles. Independently-toggleable overlays
(trails, hydrography, contour lines) are slice 1.4, not started.

### Added

- `src/features/layers/state/layersStore.ts` — zustand store for the
  active base layer, separate from `mapStore` (viewport)
- `src/features/layers/components/LayerManagerPanel.tsx` — floating panel
  over the map, radio-style base layer picker
- `MapProvider`/`MapInstance` gained `initialBaseLayer` and
  `setBaseLayer()`; `MapTilerProvider` maps each base layer to its
  MapTiler style path and switches via `map.setStyle()` — no map
  recreation, camera position is preserved across a layer switch
- `MapBaseLayerId`/`MapBaseLayerOption` in `src/types/map.ts`

### Known limitations

- No overlay layers (trails, hydrography, contours) or per-layer
  opacity/visibility yet — slice 1.4
- Base layer selection is not persisted across sessions (matches the
  existing viewport limitation from slice 1.1)

## Deployment: GitHub Pages (2026-08-15)

- `.github/workflows/deploy.yml`: builds and deploys `dist/` to GitHub
  Pages on every push to `main` (typecheck/lint/test gate the deploy).
  `VITE_MAP_TILES_API_KEY` is injected from a GitHub Actions secret, never
  committed.
- `vite.config.ts`: `base` (and the PWA manifest's `start_url`/`scope`) is
  `/CTR-HUNTING/` only when built with `GITHUB_PAGES=true` (set by the
  workflow); local dev/build stay at `/`. Fixes the previously-broken
  deployment, which served the raw `index.html` with root-relative asset
  paths that 404'd under the project's GitHub Pages subpath.
- `src/app/routes.tsx`: `createBrowserRouter` now takes
  `{ basename: import.meta.env.BASE_URL }`. Found after the first deploy:
  assets loaded correctly but every route 404'd, because React Router
  didn't know requests were arriving under `/CTR-HUNTING/` and only ever
  matched routes against the bare `/`.
- Routing fixed, but the map itself was still blank on the live deploy.
  Root cause: MapLibre's worker script (`maplibre-gl-worker.mjs`) imports a
  sibling chunk (`maplibre-gl-shared.mjs`) via a relative path; the `?url`
  import used to fix dev mode copies the worker but not that sibling, so
  it 404'd as soon as the worker tried to load it. Fixed by adding
  `vite-plugin-static-copy` to copy both files, unhashed and side by side,
  to `maplibre/` in the build output (dev and prod), and pointing
  `setWorkerUrl()` there via `import.meta.env.BASE_URL`. Moved that call
  from module scope into `createMap()` — at module scope it was an
  unconditional side effect that defeated the dead-code elimination
  documented above (an unconfigured app was shipping ~1 MB of unused
  MapLibre code before this fix).

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
