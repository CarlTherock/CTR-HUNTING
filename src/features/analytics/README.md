# features/analytics

**Status:** Phase 8 (Analytics Engine) and Phase 9 (Analysis Map)
complete — 6 independent, explainable analyzers, reachable both as a
single-point tool and as a heatmap over the whole visible area, both on
the Map page. `/analysis` is now a real overview/landing page for both,
not a placeholder.

## The 6 analyzers (`utils/analyzers.ts`)

Pure functions, each taking real already-available data and returning an
`AnalyzerResult` — a 0–100 score (or `null`, never guessed, when there
isn't enough data) plus the real `AnalysisFactor[]` that produced it. No
score is ever shown without its factors (a hard project rule) — see
`AnalysisControl.tsx`'s expandable per-analyzer cards.

- **Terrain** — real slope/aspect from `terrainQuery.sampleSlopeAspect()`
  (Phase 4).
- **Vegetation** — real OpenStreetMap `landuse`/`natural` tags near the
  point, via `services/vegetation/` (see below).
- **Weather** — a fresh on-demand fetch for the exact tapped coordinate
  (`weatherProvider.fetchForecast`), not the app-wide "current location"
  weather.
- **Wind** — a focused single-cell grid fetch for the tapped point
  (`windProvider.fetchWindField` with a tiny bounding box, `gridSize: 1`)
  — works regardless of whether the Map page's wind layer is toggled on.
- **Time** — `utils/temporal.ts`'s real sun/moon/solunar data (Phase 7),
  evaluated against the current moment.
- **History** — the user's own real local waypoints/tracks
  (`waypointsStore`/`tracksStore`), never anything fabricated.

Several factors are deliberately framed around commonly cited outdoor
observations (barometric pressure trends, crepuscular dawn/dusk
activity, Solunar Theory) rather than settled science — each says so
directly in its own explanation text, per the phase's "no result
presented as certainty when the underlying data is probabilistic" rule.
`combineAnalyses()` averages only the analyzers that actually produced a
score — a missing one is excluded, never treated as zero or filled with
a guess.

## Vegetation data source (`services/vegetation/`)

Researched live before writing any code (this app's hard rule: never
fabricate a data source). Findings:

- **ESA WorldCover**: no point-query API exists — only downloadable
  raster tiles, unusable for a live per-tap lookup. Ruled out.
- **USGS NLCD**: a real, live, CORS-open point-query API exists (Esri
  ImageServer `identify`), but it's **US-only** — no coverage for this
  app's actual home region (Quebec/Canada). Not used, to keep scope
  focused; a real option to revisit if the app ever needs US coverage.
- **Overpass API** (OpenStreetMap): confirmed live — real, free, keyless,
  CORS-open (`Access-Control-Allow-Origin: *`), globally available.
  `OverpassVegetationProvider.ts` queries `nwr(around:R,lat,lng)` for
  `landuse`/`natural`/`leisure=park` tags and maps them to a small set of
  hunting-relevant categories (forest/wetland/agricultural/grassland/
  water/developed) — all public, documented OSM wiki tag values, not
  invented ones. Coverage depends on how densely that area has been
  mapped (sparse in remote wilderness) — reported as `unavailable` in
  that case, never guessed from something like elevation alone.

## `AnalysisControl.tsx` (Map page)

Same arm-then-tap pattern as `TerrainInfoControl`/`ElevationProfileControl`
— tap the "Analyze this spot" button, then tap the map once. Wired from
`MapPage.tsx`'s `onMapClick`, checked after waypoint-placing and terrain
modes. Shows a combined score (explicitly labeled "a probabilistic read,
not a guarantee") plus each analyzer as an expandable card with its real
factors and their individual confidence levels.

A recent-spots comparison strip (Phase 9's "comparison" requirement)
keeps the last 3 analyzed points visible as compact score chips —
tapping one recalls its cached result instantly, no re-fetch.

## Analysis heatmap (Phase 9)

`heatmapEngine.ts`'s `computeHeatmapCell()` runs the same 6 analyzers
Phase 8 uses, for one grid point — `state/heatmapStore.ts` maps it over a
`buildGrid()` (`utils/grid.ts`, the same grid-point math the Phase 6 wind
layer uses) covering the visible area, from exactly **3 real network
requests total** regardless of grid size: one batched wind grid fetch
(`windProvider.fetchWindField`), one weather fetch at the area's center
(weather doesn't meaningfully vary within a typical hunting-area
viewport, so one point stands in for the whole area — documented as such,
not silently assumed), and one batched vegetation query covering the
whole bounding box (`vegetationProvider.fetchVegetationGrid()`, new for
this phase — a single Overpass call over the bbox, with each real tagged
element assigned to its nearest grid cell, rather than one query per
point).

`MapLibreProvider.ts`'s `createAnalysisHeatmapLayer()` draws it as a soft
color-graded overlay (same radial-gradient-blob technique as the Phase 6
weather layers) on its own canvas, independent of the wind/weather
canvas so both can be shown together. `utils/analysisHeatmapColors.ts`
provides the red (unfavorable) → green (favorable) scale, using the same
score buckets `AnalysisControl`'s text labels do.

`HeatmapControl.tsx`'s "Score shown" selector (combined, or any one of
the 6 analyzers alone) is Phase 9's "configurable scores" — switching it
is a pure client-side re-projection of the already-computed cells (see
`MapPage.tsx`'s heatmap effect), never a re-fetch.

**Not verified live** (no map API key in this environment): the actual
on-map "Analyze this spot" and heatmap flows, since both need a live
`MapInstance` — same caveat as Phases 3/4/6's other map-dependent tools.
The analyzer math (`utils/analyzers.ts`), the heatmap engine
(`heatmapEngine.test.ts`), the vegetation grid provider, `heatmapStore`,
and the full store/UI wiring (`MapPage.test.tsx` integration tests
covering the tap → combined-score flow, the heatmap toggle, the view
switcher, and the comparison strip) are fully tested instead.
