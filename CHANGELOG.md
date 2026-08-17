# Changelog

All notable changes to this project are documented here, grouped by
roadmap phase (see `PROJECT_SPECIFICATION.md`).

## Fix: 3D pitch capped at a bird's-eye tilt, not eye level (2026-08-17)

User feedback: 3D mode felt limited — they wanted to tilt far enough to
feel like standing at eye level looking at a mountain ahead, not a
moderate downward-angled view.

### Root cause

MapLibre's own default `maxPitch` is 60° when not explicitly set — this
app never set it, so 60° (also the old `THREE_D_PITCH` preset) was
literally the hard ceiling for both the preset button *and* manual
drag-tilt gestures. Confirmed directly against MapLibre's installed type
definitions, not assumed.

### Changed

- `MapLibreProvider.ts`: `maxPitch: 85` set explicitly on the map — the
  real ceiling MapLibre's own docs describe for the `pitch` option (0–85)
  before flagging higher values as "experimental."
- `ViewModeToggle.tsx`: `THREE_D_PITCH` 60° → 80° — near-horizon, eye-level
  framing. Users can still drag-tilt further, up to the new 85° ceiling.

### Verified

`npm run typecheck`, `lint`, `test` (189/189 — 1 new
`MapLibreProvider.test.ts` test asserting `maxPitch` is actually passed
to the map, plus an updated `MapPage.test.tsx` assertion for the new
preset pitch) and `build` all pass. Visual confirmation on a live map
wasn't possible this round (no map API key in the local `.env`) — the
fix is a straightforward constructor-option/constant change, verified
directly against MapLibre's real, installed type definitions rather than
assumed from memory.

## Phase 5 — Weather, complete (2026-08-17)

Current conditions, 24h hourly forecast, and an offline cache fallback,
behind a swappable provider adapter.

### Provider: Open-Meteo, verified live, no API key

Open-Meteo (open-meteo.com) was chosen because it needs no API key for
non-commercial use (verified directly against their live docs — no key
management step at all, unlike the Phase 1 map providers) and every
parameter name used (`temperature_2m`, `relative_humidity_2m`,
`wind_gusts_10m`, `surface_pressure`, etc.) was confirmed against their
docs before being hard-coded. One wrinkle: their `current=` block
doesn't natively include visibility (it's `hourly=`-only, confirmed via
docs) — `OpenMeteoWeatherProvider` sources current visibility from the
first hourly sample instead of omitting it or guessing.

### Added

- `src/types/weather.ts`: `WeatherConditions`, `HourlyForecastEntry`,
  `WeatherForecast`.
- `src/services/weather/` (`WeatherProvider` interface,
  `OpenMeteoWeatherProvider`, `index.ts`) — the adapter pattern
  `src/services/README.md` already documented for this phase.
- `features/weather/state/weatherStore.ts`: fetches once on mount (GPS if
  already fixed, else the map's last known center) and once more if a GPS
  fix arrives afterward — deliberately **not** on every subsequent GPS
  update, to avoid hammering the free API on ordinary GPS jitter; a manual
  refresh button covers "I've actually moved." Every successful fetch is
  cached (`settingsRepository`/Dexie); a later failed fetch falls back to
  that cache, clearly flagged (`isCached` + the real error reason) rather
  than silently presenting stale data as fresh.
- `features/weather/pages/WeatherPage.tsx`: current-conditions card
  (temperature, humidity, pressure, precipitation, cloud cover,
  visibility, wind, gusts) + a horizontally-scrollable 24h hourly
  forecast. Wind speed/gusts show here as one metric among others —
  Wind's own dedicated engine (direction, animation, timeline) is Phase 6,
  per the spec's phase split.

### Verified

`npm run typecheck`, `lint`, `test` (188/188 — 13 new tests across
`OpenMeteoWeatherProvider.test.ts`, `weatherStore.test.ts` and
`WeatherPage.test.tsx`) and `build` all pass. **Fully verified live in
the browser** — unlike Phases 3/4, which needed a map API key this
session didn't have, Open-Meteo needs no key at all: real current
conditions (22°C, 85% humidity, 100% cloud cover, 8.8 km visibility) and
a real 24h hourly forecast rendered correctly for the default map
coordinate, cross-checked against a direct `fetch()` to the same
Open-Meteo endpoint from the same browser context (identical
temperature/timestamp), and the Dexie cache write was confirmed directly
via IndexedDB inspection.

## Elevation profile: show points/line on the map while measuring (2026-08-17)

User feedback: tapping points for an elevation profile gave no visual
feedback on the map itself — nothing showed where a point landed, or
what path the eventual chart would describe.

### Added

- `MapInstance.setMeasurePath(points)` (`MapProvider.ts`,
  `MapLibreProvider.ts`): draws a dot for every tapped point immediately,
  plus a dashed connecting line once there are 2 or more — works for any
  number of points, not just 2. Its own dedicated GeoJSON source/layers
  (`measure-path`, re-added on every style reload like the other custom
  sources), kept independent of `setTrackPreview()` so an elevation
  measurement and a GPS recording never draw over or clear each other.
- `MapPage`: a new effect syncs `terrainToolsStore.profilePoints` to
  `setMeasurePath()` — points and the line appear as they're tapped, and
  stay visible after "Done" until the chart panel is discarded (so the
  numbers in the chart stay visually tied to the path on the map).

### Verified

`npm run typecheck`, `lint`, `test` (175/175 — 6 new
`MapLibreProvider.test.ts` tests for the new source/layers, 1 new
`MapPage.test.tsx` integration test for live point-by-point updates) and
`build` all pass. Visual confirmation on a live map wasn't possible this
round (no map API key in the local `.env`) — the GeoJSON the source
receives at each step (point-only, then point+line, then cleared) is
asserted directly in `MapLibreProvider.test.ts` instead.

## Fix: terrain exaggeration stepper unreachable in 3D mode (2026-08-17)

User feedback: switching to 3D made the exaggeration stepper land
underneath `WaypointControl`'s "+" button (both near `top-44 right-3`),
so it couldn't be tapped. Also requested a wider exaggeration range.

### Changed

- `ViewModeToggle.tsx`: the stepper used to stack *below* the 2D/3D
  toggle inside the same absolutely-positioned wrapper — harmless height
  in 2D, but in 3D it grew the wrapper down into the next fixed-position
  control below it. Now laid out as a single row (stepper beside the
  toggle, not under it), so its height never changes and it can't drift
  into another control regardless of mode.
- Exaggeration range: 1–3 (0.5 steps) → **1–10 (whole-number steps)**,
  per request. Default bumped from 1.5 to 2 to match the new integer
  stepping.
- `mapStore.ts`: `setTerrainExaggeration` clamps to `[1, 10]`.

### Verified

`npm run typecheck`, `lint`, `test` (169/169 — updated
`mapStore.test.ts`'s clamp-range assertion and `MapPage.test.tsx`'s
exaggeration-stepper assertions for the new default/step) and `build`
all pass. Visual confirmation of the fixed layout on a live map wasn't
possible this round (no map API key in the local `.env`) — the fix
itself is a pure layout change (stacking → single row), verified by the
same pixel-math reasoning that found the bug: the toggle row's height at
`top-32` now stays constant whether or not the stepper is showing, so it
can never reach into `WaypointControl`'s `top-44` slot.

## Phase 4 — Terrain 3D, complete (2026-08-16)

Real elevation relief in 3D mode, altitude/slope/aspect point queries,
and an elevation-profile line tool.

### Design decision: AWS Terrarium tiles, not MapTiler's terrain-rgb-v2

MapTiler offers a real `terrain-rgb-v2` raster-dem tileset, but this
session couldn't verify its RGB-decoding convention from live
documentation (no API key to inspect the actual tiles, and MapTiler's
own docs don't state it) — MapLibre's raster-dem source needs an exact
`encoding` value (`mapbox` | `terrarium` | `custom`) to decode elevation
correctly, and guessing wrong would silently produce fabricated
elevation numbers. AWS's public "Terrarium" elevation tiles
(`s3.amazonaws.com/elevation-tiles-prod/terrarium/…`, verified via
registry.opendata.aws and MapLibre's own official 3D-terrain example)
are free, keyless, and their encoding is unambiguous — used instead.
Also confirmed Esri has no MapLibre-compatible raster-dem elevation
service (their elevation data is LERC-encoded, a different format for
the ArcGIS SDK, not simple XYZ raster-dem tiles) — terrain is
independent of the base-layer vendor either way, since it's a separate
draped mesh, not part of the visual style.

### Added

- `src/utils/terrain.ts`: `computeSlopeAspect()` (central-difference
  gradient from 4 real elevation samples) + `compassLabel()`.
- `MapProvider.setTerrainEnabled(enabled, exaggeration)` /
  `.queryElevation(coordinate)`: the DEM source is re-added on every
  style reload (same pattern as the track-preview/offline-tile sources)
  so a base-layer switch never silently drops terrain.
- `mapStore.terrainExaggeration` (1×–3×, clamped) +
  `ViewModeToggle`'s new stepper, shown only in 3D mode.
- `features/map/terrainQuery.ts`: `sampleSlopeAspect()` and
  `sampleElevationProfile()` — pure, directly-testable functions that
  take a plain `queryElevation` callback rather than a `MapInstance`.
- `components/TerrainInfoControl.tsx`: single-tap "what's the elevation/
  slope/aspect here" tool (same arm-then-tap pattern as placing a
  waypoint).
- `components/ElevationProfileControl.tsx`: multi-tap "draw a path, see
  its elevation profile" tool — a hand-rolled inline SVG chart (no
  charting library added just for this; that's a Phase 10 decision).

### Verified

`npm run typecheck`, `lint`, `test` (169/169 — 30 new tests across
`terrain.test.ts`, `terrainQuery.test.ts`, `terrainToolsStore.test.ts`,
`mapStore.test.ts`, `MapLibreProvider.test.ts` and `MapPage.test.tsx`)
and `build` all pass. The actual rendered 3D relief and whether AWS's
Terrarium tiles resolve end-to-end could **not** be visually verified
this round (no map API key in the local `.env`) — the wiring (source
re-add on style reload, `setTerrain`/`queryTerrainElevation` calls, all
the slope/aspect/profile math) is unit-tested instead, consistent with
every prior slice that needed a live map.

## Phase 3 — Offline, all four slices (2026-08-16)

Downloaded map areas now work fully offline: select an area, see a real
tile-count estimate, download with live progress, manage storage, and get
a clear offline indicator with a manual resync option.

### Design decision: no vendor tile URL guessing

The hard constraint: this session had no live map API key, and the
project's "never fabricate technical facts" rule means MapTiler's/Esri's
real per-tile URL templates couldn't be assumed or guessed. So instead of
constructing tile URLs ourselves, `MapLibreProvider.downloadArea()`
sweeps the map's own camera across the target tile grid (`map.jumpTo()`
per tile, computed via real slippy-map tile math in `src/utils/tiles.ts`,
waiting for MapLibre's `'idle'` event) — this makes MapLibre issue its
own real tile requests using whatever template the active style actually
has, which we never parse or need to know. Every tile request is
redirected through a custom `ctrtile://` protocol
(`addProtocol`/`transformRequest`) to a cache-first handler backed by the
Cache Storage API (`src/offline/tileCache.ts` — real binary storage,
distinct from Dexie/IndexedDB which stays for small structured records).

**Known limitation, flagged in code comments, not silently assumed
solved:** MapLibre's docs note a custom protocol may also need
registering inside its worker (vector tile parsing runs there) — this app
uses MapLibre's *stock*, unmodified worker, so if real-device testing
shows vector tiles bypassing the cache, that's the fix.

### Added

- `src/utils/tiles.ts`: real slippy-map tile math (OSM's standard
  formulas) — `lngLatToTile`/`tileToLngLat`/`tileCenterLngLat` (round-trip
  tested), `tileRangeForBounds`/`tileCountForBounds`/`tilesForRange`.
- `src/offline/tileCache.ts`: Cache Storage API wrapper (`hasTile`,
  `getTile`, `fetchAndCacheTile`, `putTile`, `deleteTiles`,
  `estimateStorageUsage` via real `navigator.storage.estimate()`).
- `src/database/offlineAreasRepository.ts` (Dexie `offlineAreas` table,
  `db.version(3)`): area metadata — bounds, zoom range, status, real
  tile/byte counts, and the exact `tileUrls` it downloaded (so deleting
  one area removes precisely its tiles, never another's).
- `MapProvider.getBounds()` / `.downloadArea()`: the two new
  `MapInstance` methods described above.
- `features/offline/state/offlineStore.ts`: selection/download
  orchestration — `startDownload` and `refreshArea` (re-download an
  existing area's saved bounds, the "resync" affordance) share one
  `runDownload` helper for persist/progress/cancel/error handling.
- `features/offline/components/OfflineAreaControl.tsx` (Map page):
  idle (download button + a small refresh list for already-downloaded
  areas matching the current base layer), selecting (extra-zoom-levels
  stepper, real tile count, start), downloading (live progress, cancel).
- `SettingsPage`: new "Offline maps" card — completed/errored/cancelled
  areas with delete, real storage usage/quota.
- `MapPage`: "Offline — showing cached maps" badge when
  `useOnlineStatus()` reports offline.

### Verified

`npm run typecheck`, `lint`, `test` (139/139 — 39 new tests across
`tiles.test.ts`, `tileCache.test.ts`, `offlineAreasRepository.test.ts`,
`offlineStore.test.ts`, `MapLibreProvider.test.ts`, `SettingsPage.test.ts`
and `MapPage.test.tsx`) and `build` all pass. In-browser: seeded/deleted
offline-area records directly in Dexie and confirmed the Settings list,
real storage-usage display, and delete flow all work correctly. The
actual tile-download sweep against a live map could **not** be visually
verified this round (no map API key in the local `.env`) — its wiring is
covered by provider-level tests (camera sweep, protocol handler
cache/fetch logic, cancellation) instead, consistent with prior slices
that needed a live map.

## Phase 2 — Waypoints & Tracks, slice 2.4: waypoint photos (2026-08-16)

Phase 2 is now complete. Waypoints can have photos attached, viewed, and
removed from `WaypointEditPanel`.

### Added

- `types/photo.ts` (`Photo`) + `database/photosRepository.ts`: photo CRUD
  against a new Dexie `photos` table (`db.ts` bumped to
  `version(2)` — only the changed/new store needs listing, Dexie carries
  over the rest unchanged). Photos are stored as real `Blob`s, not base64
  data URLs.
- `components/WaypointPhotos.tsx`: photo grid + "add photo" tile, rendered
  inside `WaypointEditPanel`. Adding a photo is a plain `<input
  type="file" accept="image/*" capture="environment">` — delegates
  entirely to the device's camera/gallery picker. This is **not** Phase
  12's camera tool (live preview, filters, exposure); slice 2.4 only
  attaches an already-taken photo, per "don't build ahead of the
  roadmap."
- `Waypoint.photoIds` now writes through on add/delete, so
  `WaypointsPage`'s list can show a photo count per waypoint (camera icon
  + count) without querying the photos table.
- Deleting a waypoint (`waypointsStore.deleteWaypoint`) now also deletes
  its photos (`deletePhotosForWaypoint`) — otherwise they'd be orphaned
  in Dexie forever.

### Verified

`npm run typecheck`, `lint`, `test` (94/94 — 5 new
`photosRepository.test.ts` tests) and `build` all pass. In-browser:
seeded a waypoint, attached a real 1×1 PNG through the file input (no
camera in this environment), confirmed the thumbnail rendered via a
`blob:` object URL (`naturalWidth: 1`, `complete: true`), confirmed the
list page's photo-count badge appeared, deleted the photo and confirmed
the Dexie `photos` table emptied.

## Dashboard: roadmap status caught up to actual progress (2026-08-16)

`DashboardPage`'s roadmap list and "current phase" badge had never been
updated since Phase 0 — Phase 1 (Map) and the in-progress Phase 2
(Waypoints & Tracks) both still showed as not-started, silently stale
against `PROJECT_SPECIFICATION.md`'s phase table (the actual source of
truth) since neither is generated from the other.

### Changed

- `ROADMAP` entries now carry a `status` (`'done' | 'in-progress' |
  'pending'`) instead of a plain boolean — phases 0 and 1 marked `done`,
  phase 2 `in-progress`, matching `PROJECT_SPECIFICATION.md`.
- Roadmap list: a third visual state (amber dot icon + amber text) for
  `in-progress`, distinct from the green checkmark (`done`) and gray
  circle (`pending`) it already had.
- The "Status" card's phase badge is now derived from `ROADMAP` (first
  non-`done` phase) instead of hardcoded to "Phase 0 — Foundation" —
  correct automatically as phases complete, not just this once.

### Verified

`npm run typecheck`, `lint`, `test` (89/89 — updated `App.test.tsx`'s
assertion, which was pinned to the old hardcoded "Phase 0" badge text)
and `build` all pass. In-browser at a mobile viewport: confirmed the
Status badge reads "Phase 2 — Waypoints & Tracks (in progress)" and the
roadmap list shows phases 0–1 checked, phase 2 with the amber
in-progress marker, and 3–17 still pending.

## Layout: fixed-height app shell (mobile GPS button was off-screen) (2026-08-16)

User feedback: on mobile, the Map page's "recenter on me" button was
below the fold, and trying to scroll the page up to reach it instead
panned the map (the touch landed on the map canvas, which owns that
gesture).

### Root cause

`AppShell`'s root was `min-h-dvh`, not `h-dvh` — a min-height lets the
whole page grow taller than the viewport to fit its content, which
defeats `<main>`'s own `overflow-y-auto` (nothing to scroll *within* once
the outer page already grew to match) and left the Map page's `h-full`
map container without a real bound to size against — it fell back to
`min-h-[60vh]`, which combined with the header/nav chrome could push
floating controls below the fold.

### Changed

- `AppShell.tsx`: root `min-h-dvh` → `h-dvh` (fixed) — the page itself
  never exceeds the viewport now; `<main>` scrolls internally for pages
  with more content than fits (confirmed still works on Dashboard), and
  the Map page's map container gets a real bounded height to fill.
- `MapPage.tsx`: dropped the "Interactive terrain map — MapTiler and Esri
  base layers, switchable below." description line and tightened the
  page's vertical gap (`gap-6` → `gap-3`) — extra room reclaimed for the
  map itself, per user feedback that it was eating into limited mobile
  screen space for a sentence that added little.

### Verified

`npm run typecheck`, `lint`, `test` (89/89) and `build` all pass.
In-browser at a 375×812 mobile viewport: confirmed `document.documentElement.scrollHeight`
now equals `window.innerHeight` (no more page-level overflow) on the Map
page, and that the Dashboard page (long content) still scrolls correctly
*inside* `<main>` rather than the whole page. Could not visually confirm
the GPS button's exact on-screen position with a live map (no API key in
the local `.env`) — the underlying page-scroll bug is fixed regardless of
that, since it was a layout issue independent of the map itself.

## Phase 2 — Waypoints & Tracks, slices 2.2 & 2.3 (2026-08-16)

Dedicated Waypoints & Tracks list page, drag-to-move for waypoints, and
GPS track recording. Creation still only happens from the Map page (a
waypoint needs a tap position, a track needs live GPS) — this is
read/edit/delete for waypoints plus the full record/save/delete flow for
tracks.

### Added

- `pages/WaypointsPage.tsx`: real list of every saved waypoint (icon,
  color ring, category, coordinates — tap to open the same
  `WaypointEditPanel` the Map page uses) and every recorded track
  (distance, duration, date, delete). No longer a `PhasePlaceholder`.
- `categories.ts`: `CATEGORY_OPTIONS`/`COLOR_OPTIONS`/`CATEGORY_LABEL`/
  `CATEGORY_ICON` extracted out of `WaypointEditPanel` so the list page
  can show the same icon/label per category without duplicating the
  table.
- Drag-to-move: waypoint markers are now draggable; dropping one calls
  the new `onWaypointDragEnd` (`MapProvider.ts`), wired straight into
  `waypointsStore.updateWaypoint(id, { coordinate })` — a drag is
  persisted like any other edit, no separate confirm step.
- `state/tracksStore.ts` + `database/tracksRepository.ts`: GPS track
  recording — start/pause/resume/stop, live distance (Haversine,
  `src/utils/geo.ts`) and duration. A track is persisted **incrementally**
  (empty record on start, re-written on every accepted GPS sample), not
  once at the end, so a crash mid-recording loses at most the last
  sample. Samples under 5 m from the last point are dropped as GPS
  jitter, not real movement.
- `components/TrackRecorderControl.tsx`: floating record/pause/resume/
  stop control with a live elapsed-time + distance readout.
- `MapInstance.setTrackPreview()` (`MapProvider.ts`, `MapLibreProvider.ts`):
  draws the in-progress track as a live blue line on the map while
  recording, re-added after every base-layer switch (`setStyle()` wipes
  custom sources/layers, same fix pattern the overlay layers already
  use).

### Verified

`npm run typecheck`, `lint`, `test` (89/89 — 24 new tests across
`geo.test.ts`, `tracksRepository.test.ts`, `tracksStore.test.ts`,
`MapLibreProvider.test.ts` and `MapPage.test.tsx`), and `build` all pass.
In-browser: seeded a waypoint and a track directly into the local Dexie
database (no map API key available locally) and confirmed the list page
renders both correctly, tapping a waypoint opens its editor pre-filled,
and deleting a track removes it and restores the empty state. Drag-to-move
and the live track-recording map preview could **not** be visually
verified this round — both need a real map (API key), which the local
`.env` doesn't have; their wiring is covered by the provider-level tests
in `MapLibreProvider.test.ts` and the mocked-provider tests in
`MapPage.test.tsx` instead.

## Map: more zoomed-in default view (2026-08-16)

Further user feedback: even with the GPS recenter zoom fix above, the
map's *initial* view (before any GPS fix or recenter tap) still opened at
zoom 6 — whole-province scale, not useful to actually look at.

### Changed

- `mapStore.ts` `DEFAULT_VIEW.zoom`: 6 → 12 (town/regional scale), same
  center coordinate. Doesn't affect `GPS_LOCATE_ZOOM` (still 16, set in
  the entry above) — this only changes what the map looks like before any
  location is known.

### Verified

`npm run typecheck`, `lint`, `test` (64/64), and `build` all pass; no
test asserted the old default zoom value, so nothing needed updating
there. Visual check in the Browser pane was not possible this round (no
map API key in the local `.env`) — this is a single numeric constant with
no surrounding logic, so the automated checks were treated as sufficient.

## Waypoints: categories, colors, marker redesign; GPS recenter zoom (2026-08-16)

User feedback after trying slice 2.1: wanted per-waypoint color and more
precise categories shown on the map (referencing onX Hunt/HuntStand-style
markers), and GPS recenter left the view too zoomed out to be useful.

### Changed

- `WaypointCategory` expanded from 9 generic values to 14
  hunting-specific ones (stand/blind, trail camera, food plot, water,
  bedding area, game sign, kill site, trailhead, parking, campsite,
  hazard, gate, custom, general), each with its own icon
- Added `WaypointColor` — a fixed 8-color preset per waypoint
- `WaypointEditPanel`: category is now an icon grid (not a plain
  `<select>`) and color a swatch picker
- Map markers redesigned: white circle + black category icon inside a
  colored ring (was a plain amber teardrop), `anchor: 'center'`. Editing
  an existing waypoint now visibly updates its marker on the map, not
  just its row in the (not yet built) list page — `setWaypoints()` was
  only diffing position before, not category/color
- GPS recenter (`GpsControl` → `MapPage.locate()`) now also zooms to at
  least 16 (never zooms *out*) — before, it only panned, which could
  leave the view too far out to be useful in the field

### Fixed

- Race condition in `waypointsStore.placeWaypointAt`: `isPlacing` was
  only cleared *after* the async Dexie write completed, so two map
  clicks landing before that write resolved (found while testing — two
  events dispatched for what was meant to be one click) both passed the
  "is placing" guard and created two waypoints from one tap. Now cleared
  synchronously before the first `await`, so a second near-simultaneous
  click reads `isPlacing: false` immediately.

### Verified

In-browser: category grid and color swatches render and select
correctly; saved marker shows the right icon/ring color; the earlier
duplicate-waypoint bug reproduced reliably with a
mousedown+mouseup+click dispatch and is gone after the fix (single click
→ single waypoint, confirmed via direct IndexedDB read).

## Phase 2 — Waypoints & Tracks, slice 2.1: create/edit/delete (2026-08-16)

Real waypoints: tap the map to place one, edit its name/category/notes,
delete it — all persisted to Dexie immediately, no "unsaved draft"
concept. Creation happens from the Map page for now; a dedicated
Waypoints list page (with drag-to-move) is slice 2.2.

### Added

- `src/database/waypointsRepository.ts` — CRUD against the `waypoints`
  Dexie table that's existed since Phase 0, following
  `settingsRepository`'s real-offline-read/write pattern
- `src/features/waypoints/state/waypointsStore.ts` (zustand) — in-memory
  waypoint list plus `isPlacing`/`editingId` UI state; every mutation
  writes through to Dexie first
- `src/features/waypoints/components/WaypointControl.tsx` — the "add
  waypoint" button; arms placing mode with a visible banner + cancel,
  never a silent "tap somewhere" state
- `src/features/waypoints/components/WaypointEditPanel.tsx` — bottom-sheet
  form (name, category, notes, delete); holds its own draft, only writes
  through on "Save"
- `MapProvider`/`MapInstance` gained `onMapClick`, `onWaypointClick` and
  `setWaypoints()`; `MapLibreProvider` renders an amber teardrop pin per
  waypoint (diffed by id, not recreated on every render), visually
  distinct from the round green GPS dot

### Verified

In-browser: placed a waypoint, renamed and saved it, reloaded the page
(full navigation, not SPA) and confirmed it survived — real IndexedDB
persistence, not component state. Deleted it and confirmed removal from
both the map and Dexie. No console errors.

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
