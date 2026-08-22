# features/map

**Status:** Phase 1 complete (all five slices), Phase 4 (Terrain 3D)
complete — real elevation relief, orientation, altitude/slope/aspect, and
elevation profile — and Phase 6 (Wind) complete, hosting
`features/wind/`'s flow-field control. See `features/wind/README.md` for
the wind engine itself.

The 2D↔3D toggle (`components/ViewModeToggle.tsx`, scaffolded in slice
1.5 as pitch/bearing only) now also drapes real elevation relief under
the map when switching to 3D — see "Terrain 3D (Phase 4)" below.

Interactive 2D/3D map: pan/zoom, GPS, satellite/topo/trail/hydrography base
layers, contour lines, layer manager. The map is a central, provider-agnostic
platform component (per project rules) — no feature couples directly to a
specific map SDK; `src/services/map/` (`MapProvider` interface,
`MapLibreProvider` implementation) is that adapter. `MapLibreProvider`
serves both MapTiler and Esri base layers through the one MapLibre engine
— see `features/layers/README.md` for the full layer list and why each
was picked.

`state/mapStore.ts` holds the shared viewport (center/zoom/pitch/bearing) in
zustand — read by the map today, and by whatever else needs to react to or
drive the camera as later slices/phases are added.

The default view (no GPS fix yet, no waypoint selected) opens at zoom 12
(town/regional scale), not the original zoom 6 (whole-province scale) —
per user feedback that the initial map felt too zoomed out to be useful.
The GPS "recenter on me" button (`features/gps/`) separately zooms further,
to 16 (`GPS_LOCATE_ZOOM` in `pages/MapPage.tsx`), once a real fix is
available.

`MapPage` also hosts two `features/waypoints/` controls that need direct
map wiring, not just shared state: waypoint markers are draggable
(`onWaypointDragEnd` in `CreateMapOptions`) for drag-to-move, and
`MapInstance.setTrackPreview()` draws the in-progress GPS track as a live
line while `TrackRecorderControl` is recording — see
`features/waypoints/README.md` for both.

`MapInstance.getBounds()` and `.downloadArea()` (Phase 3 — Offline) are
the other two map-specific escape hatches, used by
`features/offline/components/OfflineAreaControl.tsx`. `downloadArea`
sweeps the camera across a tile grid rather than fetching tiles directly
— see `features/offline/README.md` for why (short version: this app
never hard-codes or parses a vendor's tile URL template).

## Terrain 3D (Phase 4)

`MapInstance.setTerrainEnabled(enabled, exaggeration)` and
`.queryElevation(coordinate)` (`MapProvider.ts`) back four things, all
wired from `MapPage`:

- **Real elevation relief** — `ViewModeToggle`'s 3D button now calls
  `setTerrainEnabled(true, exaggeration)` (and `false` back in 2D), with
  an exaggeration stepper (1×–10×, whole-number steps,
  `mapStore.terrainExaggeration`) shown only in 3D — laid out *beside*
  the 2D/3D buttons in one row, not stacked below them (stacking used to
  grow the control down into `WaypointControl`'s button in 3D mode). The
  DEM source is AWS's public **Terrarium** elevation
  tiles (`s3.amazonaws.com/elevation-tiles-prod/terrarium/…`) — not
  MapTiler's `terrain-rgb-v2`, whose RGB-decoding convention couldn't be
  verified from live documentation in this session (no API key to
  inspect it directly, and MapTiler's own docs don't state it); Terrarium
  is free, keyless, and its encoding is unambiguous and natively
  supported by MapLibre (`encoding: 'terrarium'`). Terrain is independent
  of the base-layer vendor (it's a separate draped mesh), so this works
  under any base layer.
- **Orientation** — the existing `NavigationControl` (compass + pan)
  already handles rotate/tilt gestures; `ViewModeToggle`'s "2D" button
  doubles as a bearing-reset (`onChange(0, 0)`). The 3D preset pitch is
  80° (not MapLibre's 60° *default* `maxPitch`, which was silently
  capping how far users could manually drag-tilt too) — `maxPitch: 85` is
  now set explicitly on the map, the real ceiling MapLibre's own docs
  describe for the `pitch` option before flagging values as
  "experimental." 80° reads as standing at eye level looking at the
  terrain ahead, not a moderate bird's-eye tilt, per user feedback.
- **Altitude/slope/aspect** — `components/TerrainInfoControl.tsx`: arm,
  tap the map once, get a real `queryElevation` reading plus a
  slope/aspect estimate from `terrainQuery.sampleSlopeAspect()` (4
  neighbor elevation samples, central-difference gradient — a real
  calculation from real queried data, explicitly labeled as a rough field
  estimate, not survey-grade).
- **Elevation profile** — `components/ElevationProfileControl.tsx`: arm,
  tap multiple points, "Done" samples elevation along the whole path
  (`terrainQuery.sampleElevationProfile()`) and renders a hand-rolled
  inline SVG line chart — no charting library added just for this; that's
  a Phase 10 (Advanced Charts) decision, not this slice's to make. Each
  tapped point is drawn on the map immediately (`MapInstance
  .setMeasurePath()`, its own dot+line source — independent of
  `setTrackPreview()` so a GPS recording and a measurement never
  interfere with each other), and the connecting line/dots stay visible
  after "Done" too, until the chart panel is discarded.

### Bug fixed (found via user report on the deployed app): terrain always showed "no data" outside 3D mode

`queryElevation` (and therefore every Phase 8/9 analyzer/heatmap cell
that depends on real elevation) always returned `null` unless the user
happened to be in 3D view. Root cause, confirmed directly in MapLibre's
own type definitions: `queryTerrainElevation` "Returns null if terrain
is not enabled" — and terrain was only ever set (`map.setTerrain(...)`)
while the 3D toggle was on; in the default 2D view it was `null`. Fixed
by keeping terrain *always* set (real scale, exaggeration 1, when not in
3D) — with pitch 0 (looking straight down), true-scale terrain
displacement isn't visually different from no terrain, so 2D still
looks flat, but elevation queries now work everywhere. A second bug came
with it: MapLibre's docs also say the returned value "will be reflective
of (multiplied by) that exaggeration value" — so a query made while 3D
exaggeration was, say, 3× was returning 3× the true elevation, silently
corrupting slope/aspect math. `queryElevation` now divides the raw value
back down by the currently active exaggeration, so it always returns the
real elevation regardless of the visual exaggeration in use.

**Not verified live** (no map API key in this environment): the actual
rendered 3D relief, and whether AWS's Terrarium tiles resolve/render
correctly end-to-end. The wiring (source re-added on every style reload,
`setTerrain`/`queryTerrainElevation` calls, all pure math in
`utils/terrain.ts`/`terrainQuery.ts`) is unit-tested instead.

## Wind (Phase 6)

`MapInstance.setWindField(field, hourOffset)` (`MapProvider.ts`) owns an
animated particle flow-field, entirely self-contained inside
`MapLibreProvider.ts` — a plain `<canvas>` absolutely positioned over the
map container (not a GL custom layer), redrawn every frame via
`requestAnimationFrame`. Particle positions are real lat/lng, reprojected
to screen pixels each frame with `map.project()`, so pan/zoom/rotate need
no extra bookkeeping. See `features/wind/README.md` for the data layer,
UI, and the "Optimal Wind" per-waypoint feature it also introduced.

## Analytics (Phases 8-9)

`features/analytics/components/AnalysisControl.tsx` adds a fourth
arm-then-tap tool (alongside terrain info, elevation profile, and
waypoint placement) — "Analyze this spot" runs all 6 explainable
analyzers for the tapped point using the map's live `queryElevation` for
terrain, plus on-demand weather/wind/vegetation fetches for that exact
coordinate. `components/HeatmapControl.tsx` adds a second layer toggle
(alongside wind) coloring the whole visible area by score, via its own
independent canvas (`MapInstance.setAnalysisHeatmap`). See
`features/analytics/README.md` for the full design.

## Field Mode (Phase 11)

When `features/field-mode/state/fieldModeStore.ts`'s toggle is on,
`MapPage.tsx` hides every advanced tool above (layer manager, 3D/terrain
controls, offline area management, wind, spot analysis, heatmap),
enlarges `GpsControl`/`WaypointControl`, shows a real device compass
instead of the layer panel, and turns off the wind/heatmap layers'
animation loops for real battery savings. See
`features/field-mode/README.md` for the full design.
