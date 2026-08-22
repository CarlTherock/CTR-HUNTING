# features/analytics

**Status:** Phase 8 (Analytics Engine) complete — 6 independent,
explainable analyzers, reachable as a point tool from the Map page.
Phase 9 (Analysis Map / heatmap) is next; `/analysis` stays a
placeholder for that until it's built.

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

**Not verified live** (no map API key in this environment): the actual
on-map "Analyze this spot" flow, since it needs a live `MapInstance` for
elevation queries — same caveat as Phases 3/4/6's other map-dependent
tools. The analyzer math (`utils/analyzers.ts`, 23 tests), the vegetation
provider (5 tests), and the full store/UI wiring (a `MapPage.test.tsx`
integration test covering the whole tap → combined-score → expandable
factor flow) are fully tested instead.
