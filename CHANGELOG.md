# Changelog

All notable changes to this project are documented here, grouped by
roadmap phase (see `PROJECT_SPECIFICATION.md`).

## LayerManagerPanel: collapse after picking a base layer (2026-08-16)

Mobile UX fix: ten base-layer options left the panel covering most of a
phone screen after choosing one, with no way to see the map. It now
collapses to a small icon button as soon as a base layer is picked;
tapping the icon reopens it. Toggling an overlay does not collapse it —
that's a "flip a few, one at a time" action, not a single choice.

## Second map vendor: Esri (2026-08-16)

Eight new base layers from Esri's Basemap Styles v2 service, alongside
the two existing MapTiler ones — picked for what upcoming phases need
(terrain/hillshade ahead of Phase 4, light/dark gray canvases for Phase
8–9 analytics heatmaps, navigation for access routes), not "every style
Esri has" (the service has 60+; the rest are decorative/thematic skins
with no use here).

### Changed

- `src/services/map/MapTilerProvider.ts` → **renamed** to
  `MapLibreProvider.ts`. Both vendors serve MapLibre-compatible style
  JSON, so the same engine adapter now resolves either vendor's style
  URL — no second `MapProvider` implementation needed. Takes
  `{ mapTiler?, esri? }` API keys; either, both, or neither may be set.
- `src/services/map/index.ts` gained `availableBaseLayers` —
  `LayerManagerPanel` only ever offers a base layer whose vendor key is
  actually configured, grouped under a "MapTiler"/"Esri" heading each.
- `MapPage` corrects the stored `baseLayer` against `availableBaseLayers`
  right before creating the map, in case only one vendor ends up
  configured (e.g. Esri but not MapTiler) and the stored default
  ("outdoor") isn't actually available.

### Added

- `VITE_ESRI_API_KEY` (`.env.example`) — an ArcGIS Location Platform key
  scoped to a "Public app" with only the "Basemaps" privilege (same
  reasoning as any key shipped in a client bundle). Free tier: 2M
  tiles/month, then $0.15/1,000; no charge is possible without a payment
  method on file.
- GitHub Actions secret `VITE_ESRI_API_KEY`, wired into
  `.github/workflows/deploy.yml` alongside the existing MapTiler one.

### Verified

In-browser: every new Esri layer (Topographic, Imagery Hybrid, Imagery,
Terrain, Hillshade, Light Gray, Dark Gray) renders real tiles with
correct Esri/Vantor attribution, overlays correctly disable outside
"Outdoor", no console errors.

### Also in this change

- `Splash.tsx`: visible duration doubled (1300ms → 2600ms; fade-out
  unchanged at 450ms).

## Phase 1 — Map, slice 1.5: 2D↔3D scaffold (2026-08-16)

**Phase 1 (Map) is now complete** — all five slices done.

Camera toggle between a flat top-down view and a tilted perspective.
`MapViewState.pitch`/`bearing` were modeled in from slice 1.1 specifically
for this, so no shape change was needed — the toggle is a thin UI layer
over the `MapInstance.setView()` that's existed since then. No elevation
exaggeration: that needs real terrain data and MapLibre's `setTerrain`,
which is Phase 4 ("same layers/data as 2D" per the spec) — this scaffold
is what that phase builds on, not a preview of it.

### Added

- `src/features/map/components/ViewModeToggle.tsx` — 2D/3D button group;
  derives its active state from the current `pitch` (never owns separate
  mode state, so it can't drift out of sync with a pitch set another way,
  e.g. drag-rotate)
- 3D preset: pitch 60°, bearing -20°

### Known limitations

- No terrain elevation — Phase 4
- View mode isn't persisted across sessions (same limitation as the rest
  of the viewport since slice 1.1)

## App shell: branding + splash screen (2026-08-16)

Display brand is now "CTR Hunting" (primary) with "Field Terrain
Intelligence" as tagline — applied consistently across the sidebar brand
mark, mobile top bar, dashboard title, browser tab title, and the PWA's
installed name. `PROJECT_SPECIFICATION.md`/`ARCHITECTURE.md` keep "Field
Terrain Intelligence" as the product's technical/spec name; this only
changes what's user-visible.

### Added

- `src/components/layout/Splash.tsx` — branded opening screen (compass
  mark, animated entrance, progress sweep) shown once per cold launch,
  **only** when running standalone/installed (`display-mode: standalone`
  or iOS's `navigator.standalone`) — never on an ordinary browser tab, so
  it doesn't add a delay to normal web/dev use. `App.tsx` renders it as
  an overlay on top of the already-mounted app, not blocking anything.
- Custom entrance keyframes (`splash-icon`, `splash-text`,
  `splash-sweep`) in `src/index.css`.

### Changed

- `vite.config.ts`: PWA manifest `name`/`short_name` → "CTR Hunting —
  Field Terrain Intelligence" / "CTR Hunting" (shown under the icon on a
  phone's home screen after install)
- `index.html` `<title>` → "CTR Hunting"
- `Sidebar`, `TopBar`, `DashboardPage`: brand text updated to match

## Fix: crash on a real GPS fix (2026-08-15)

Reported by the user on both desktop and mobile, on the live deploy: the
Map page crashed ("Cannot read properties of undefined (reading 'lng')")
the moment a real GPS position arrived — present since slice 1.3, never
caught before because neither the automated tests nor manual browser
verification ever exercised a *real* fix (the test browser has no GPS, so
the marker-creation branch of `setUserLocationMarker` never ran until a
real device tried it).

- `MapTilerProvider.setUserLocationMarker()`: MapLibre's `Marker.addTo()`
  immediately reads `this._lngLat.lng` to position itself — it was being
  called before `setLngLat()`, on a brand-new marker with no position set
  yet. Fixed by positioning the marker before adding it.
- Added `src/services/map/MapTilerProvider.test.ts` (previously no test
  exercised this file's actual logic — `MapPage.test.tsx` mocks the whole
  adapter). Confirmed the new test fails with the exact same error against
  the old code, and passes against the fix.
- Verified against a simulated real GPS fix in-browser (no such fixture
  existed before), across a base layer switch too.

## Phase 1 — Map, slice 1.4: overlay layers (2026-08-15)

Independently-toggleable overlays on top of the Outdoor base layer:
trails, hydrography, contour lines. Per-layer opacity is not built yet.
Slice 1.5 (2D↔3D scaffold) is the only remaining Phase 1 slice.

### Added

- `MapProvider`/`MapInstance` gained `initialOverlays` and
  `setOverlayVisible()`
- `MapTilerProvider`'s `OVERLAY_LAYER_IDS` maps each overlay to the real
  vector layer IDs already inside MapTiler's "Outdoor" style (extracted
  from its `style.json`, not invented) and toggles their `visibility`
  layout property; re-applied on every `style.load` since `setStyle()`
  (base layer switching) discards per-layer overrides on a fresh style
  parse
- `layersStore` gained `overlays` (all on by default, matching the
  pre-1.4 appearance) and `toggleOverlay()`
- `LayerManagerPanel` gained an overlay checkbox section

### Known limitations

- Overlays only affect the "Outdoor" base layer — MapTiler's "Satellite"
  style has no equivalent layers, so the panel disables the checkboxes
  rather than let them silently do nothing while Satellite is active
- No per-layer opacity control
- Overlay/base layer selection is not persisted across sessions (same
  limitation as the viewport since slice 1.1)

## Phase 1 — Map, slice 1.3: live GPS (2026-08-15)

Real device position via the browser Geolocation API — a marker on the
map and a "recenter on me" control. Heading/compass and an
accuracy-circle overlay are not built yet.

### Added

- `src/features/gps/useGeolocation.ts` — wraps
  `navigator.geolocation.watchPosition`, returns a `DataPoint<Coordinate>`
  (`src/types/data-quality.ts`); no fix is represented as `unavailable`
  with a reason, never guessed or left at a stale position
- `src/features/gps/components/GpsControl.tsx` — floating recenter
  button, visibly disabled when there's no fix yet
- `MapProvider`/`MapInstance` gained `setUserLocationMarker()`;
  `MapTilerProvider` draws a small dot-style marker (distinct from the
  teardrop pins waypoints will use in Phase 2) via a MapLibre `Marker`
- `MapPage` shows a GPS accuracy badge (`±N m`) or an "unavailable" badge
  next to the page title, and wires the marker/recenter button to the
  new hook

### Known limitations

- No heading/compass or accuracy-circle overlay yet
- Recenter only changes the map center, not zoom — the user's current
  zoom level is preserved rather than assuming a "close-up" distance
- GPS position is not persisted or shared outside `MapPage` yet; Phase 2
  (waypoints) will call `useGeolocation()` directly where it needs "use
  my current position," since the hook has no map dependency

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
