# Field Terrain Intelligence — Project Specification

**Status:** Phase 0 (Foundation) complete; Phase 1 (Map) complete — all
five slices (1.1–1.5) done; Phase 2 (Waypoints & Tracks) complete — all
four slices (2.1 create/edit/delete/categories/notes, 2.2 list page +
drag-to-move, 2.3 GPS track recording, 2.4 waypoint photos) done; Phase 3
(Offline) complete — all four slices (3.1 area selection + tile-count
estimate, 3.2 download with live progress, 3.3 storage management, 3.4
offline status + manual resync) done; Phase 4 (Terrain 3D) complete —
real elevation relief, orientation, altitude/slope/aspect, elevation
profile; Phase 5 (Weather) complete — current conditions, hourly
forecast, offline cache fallback, swappable provider (Open-Meteo); Phase 6
(Wind) complete — animated particle flow-field, direction/speed/gusts,
24h interactive timeline, plus a per-waypoint "Optimal Wind" feature
beyond the base spec, inspired by onX Hunt's own feature of the same
name, later upgraded to a Windy-style multi-layer weather map
(Wind/Temperature/Precipitation/Clouds, calibrated color scale) and an
onX Hunt-style cross-waypoint wind comparison; Phase 7 (Temporal Data)
complete — sunrise/sunset, moonrise/moonset, moon phase, day length, a
global 24h timeline, and real solunar major/minor periods, computed
fully offline via SunCalc; Phase 8 (Analytics Engine) complete — 6
independent, explainable analyzers (terrain/vegetation/weather/wind/
time/history) over real data, reachable as a "tap the map, get an
explainable breakdown" tool; Phase 9 (Analysis Map) complete — a
color-graded heatmap over the visible area using the same 6 analyzers,
configurable to show any single analyzer or the combined score, plus a
recent-spots comparison strip
**This file is authoritative.** Together with `ARCHITECTURE.md`, `README.md`
and the validated source code, it is the source of truth for what this
product is and how it is built. If the code and this document disagree,
that is a bug in one of them — flag it, don't silently pick one.

---

## 1. Vision

Field Terrain Intelligence is a professional, scalable, **offline-first**
Progressive Web App for terrain mapping, navigation, environmental
awareness, field observation and spatial analysis — built for hunters and
other outdoor professionals who need reliable tools with no signal.

It combines, in one application: 2D/3D mapping, satellite/topographic
layers, trails, hydrography, contour lines, terrain and elevation, GPS,
waypoints, tracks, full offline mode, weather, wind, astronomical data,
temporal charts, field observations, geotagged photos, a camera tool,
environmental analytics, heatmaps, history, synchronization, and an AI
assistant.

It must feel like a real professional platform, not a prototype — see the
product mockup referenced in the project's companion planning material for
the intended look and feel (satellite/terrain map, wind & weather panel,
24h timeline, terrain analysis score, mobile field mode, desktop analytics).

### Two complementary experiences

**Mobile / field:** a simplified, fast interface usable on a phone —
map, GPS, compass, altitude, wind, waypoint, observation, camera, offline
mode.

**Desktop / tablet:** a fuller interface — large 2D/3D map, layer manager,
weather, wind, charts, timeline, terrain, analytics, history.

Both experiences read and write the **same local data** (see
`ARCHITECTURE.md` § Data layer).

---

## 2. Roadmap — 17 phases

Development proceeds strictly in this order. A phase is not started until
the previous one is implemented, tested, documented and validated. Do not
skip ahead (e.g. no AI features before the underlying data architecture
exists).

| #   | Phase                  | Goal                                                                                                                                                                                               |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | **Foundation** ✅      | React + TypeScript + Vite + PWA + Tailwind + ESLint/Prettier + tests + feature-oriented architecture + shell/nav + design system + docs                                                            |
| 1   | Map ✅                 | Interactive 2D map, zoom/pan, GPS, satellite/topo/trail/hydrography layers, contour lines, layer manager. Prepare 2D ↔ 3D from the start. All slices done: 1.1 base map, 1.2 base layer switcher, 1.3 live GPS, 1.4 overlay layers, 1.5 2D↔3D camera scaffold (elevation exaggeration is Phase 4). |
| 2   | Waypoints & Tracks ✅  | Create/edit/move/delete waypoints, categories, notes, photos; GPS track recording; distance/duration/altitude; local save. All slices done: 2.1 create/edit/delete/categories/notes, 2.2 dedicated list page + drag-to-move, 2.3 GPS track recording (start/pause/resume/stop, live distance/duration, incremental persistence), 2.4 waypoint photos (file/camera picker, stored as Blobs, deleted with their waypoint). |
| 3   | Offline ✅             | Area selection, size estimate, download, progress, local storage, storage management, offline status, resync on reconnect. All slices done: 3.1 area selection (current viewport) + real tile-count estimate, 3.2 download via camera sweep + live progress + cancel, 3.3 storage management (list/delete, real `navigator.storage.estimate()`), 3.4 offline status badge + manual per-area resync. |
| 4   | Terrain 3D ✅          | 3D terrain, rotation/tilt/zoom/pan, orientation, altitude, slope, aspect, contour lines, elevation profile. Same layers/data as 2D. Real elevation relief via a `raster-dem` source (AWS Terrarium tiles, `setTerrain`/exaggeration slider); rotation/tilt/zoom/pan via MapLibre's native handlers + `NavigationControl`; contour lines already existed (Phase 1.4 overlay); altitude/slope/aspect point query and elevation-profile line tool both via `queryTerrainElevation`. |
| 5   | Weather ✅             | Temperature, humidity, pressure, precipitation, cloud cover, visibility, wind, gusts, hourly forecast. Provider must be swappable. Provider: Open-Meteo (`WeatherProvider` adapter, keyless, verified live). Current conditions + 24h hourly forecast; offline fallback to the last successfully cached reading (Dexie via `settingsRepository`), clearly flagged when shown. |
| 6   | Wind ✅                | Dedicated wind engine: direction, speed, gusts, temporal change, map animation, interactive timeline. Provider: Open-Meteo (`WindProvider` adapter, keyless, batched grid fetch, verified live) — the same fetch also carries temperature/precipitation/cloud cover. Windy-style multi-layer map (Wind/Temperature/Precipitation/Clouds, calibrated color scale + legend, particles colored by speed) with an instant no-refetch layer switcher; 24h timeline scrubber; a per-waypoint "Optimal Wind" octant picker + live match badge; and an onX Hunt-style cross-waypoint "Wind Comparisons" panel — all beyond the base spec, built from live research on Windy and onX Hunt's real feature sets. |
| 7   | Temporal Data ✅       | Sunrise/sunset, moonrise/moonset, moon phase, day length; global 24h timeline. Computed fully client-side via SunCalc (verified BSD-2-Clause, no network call needed — offline-first by design, unlike Phases 5/6). Real moon-transit-based solunar major/minor periods per the public-domain Solunar Theory geometry, explicitly not a commercial activity score. |
| 8   | Analytics Engine ✅    | Independent analyzers: TerrainAnalyzer, VegetationAnalyzer, WeatherAnalyzer, WindAnalyzer, TimeAnalyzer, HistoryAnalyzer. Results must be explainable. All 6 built as pure functions (`utils/analyzers.ts`) over real data (Phases 4/5/6/7 + local waypoints/tracks); vegetation via a new `VegetationProvider` adapter (Overpass API/OpenStreetMap, verified live — ESA WorldCover has no point-query API, USGS NLCD is US-only). Reachable today as a "tap the map, get an explainable breakdown" tool on the Map page; a whole-area heatmap view is Phase 9. |
| 9   | Analysis Map ✅        | Heatmap, analyzed zones, configurable scores, explanatory factors, comparison. No result presented as certainty when data is probabilistic. A color-graded heatmap over the visible map area (one real `AnalysisHeatmapCell` per grid point, same 6 analyzers as Phase 8, from 3 batched requests total — never one per cell); a "score shown" selector (combined or any single analyzer, instant, no re-fetch); a recent-spots comparison strip on the point-analysis tool. |
| 10  | Advanced Charts        | 24h/12h/6h/3h/1h charts; zoom, pan, cursor, hour selection, day comparison. Time cursor synchronizes map, wind, weather, temporal data.                                                            |
| 11  | Field Mode             | Simplified mobile UI: readability, large buttons, one-handed use, low power draw, offline, GPS, map, compass, observation, camera.                                                                 |
| 12  | Camera                 | Live camera, zoom, exposure, contrast, brightness, filters, image enhancement, save with GPS + timestamp. Original image always kept.                                                              |
| 13  | Journal                | Field journal: observations, photos, positions, dates/times, conditions, tracks, notes, history — all viewable on the map.                                                                         |
| 14  | AI & Assistant         | Summarize observations, compare periods, explain an analysis, search history, detect trends. Must distinguish real data / analysis / estimate / AI interpretation / user observation at all times. |
| 15  | Synchronization        | Phone ↔ local DB ↔ sync engine ↔ cloud ↔ desktop/tablet. Conflict handling, export, import, backup.                                                                                                |
| 16  | Testing & Optimization | Cross-device testing (iPhone/Android/tablet/PC), offline, GPS, map, 3D, sync. Optimize battery, memory, network, bundle size, load time, map rendering.                                            |
| 17  | Commercial Release     | Visual identity, onboarding, user account, settings, privacy, help, docs, landing page, PWA install, optional subscription model.                                                                  |

---

## 3. Hard rules (non-negotiable)

1. Never build the whole application in one step — work phase by phase, one
   vertical slice at a time.
2. Never rewrite working architecture without a documented reason.
3. Keep business logic out of React components (UI → feature logic →
   domain/services → repositories → local/remote data).
4. External providers (map, weather, elevation, ...) sit behind a service
   adapter and must be replaceable without touching feature code.
5. Never hard-code secrets — see `.env.example`.
6. Strict TypeScript everywhere.
7. Type checking, linting, tests and a production build must all pass
   before a feature is declared complete.
8. Offline is a core requirement, not an add-on — important features must
   keep working with no network.
9. Mobile-first design; desktop/tablet remain fully supported.
10. **Never fabricate data.** Weather, terrain, satellite and historical
    data must come from a real source. A missing value is represented as
    unavailable — never guessed, defaulted, or interpolated silently. See
    `src/types/data-quality.ts`.
11. Every value shown to the user is labeled by its origin: measured,
    calculated, estimated, AI interpretation, or user observation.
12. Do not add a dependency without a reason; explain the reason.

---

## 4. Recommended technology stack

| Concern             | Choice                              | Status                                                             |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Frontend            | React 19 + TypeScript + Vite        | ✅ in place (Phase 0)                                              |
| Styling             | Tailwind CSS v4                     | ✅ in place (Phase 0)                                              |
| Routing             | React Router v7                     | ✅ in place (Phase 0)                                              |
| Local data          | IndexedDB via Dexie                 | ✅ schema in place (Phase 0), feature repositories added per-phase |
| PWA / offline shell | vite-plugin-pwa (Workbox)           | ✅ in place (Phase 0); advanced tile caching is Phase 3            |
| Mapping             | MapLibre GL JS (+ Three.js for 3D)  | ✅ base map in place (Phase 1, slice 1.1); tiles via MapTiler and Esri |
| Map/layer state     | zustand                             | ✅ in place (Phase 1, slice 1.1)                                    |
| Tests               | Vitest + Testing Library            | ✅ in place (Phase 0); Playwright e2e planned for Phase 16         |
| Backend / sync      | TypeScript API + PostgreSQL/PostGIS | Planned, Phase 15                                                  |

The exact external providers (map tiles, weather, elevation, hosting,
backend database) are chosen when their phase begins, not before — see
project rule "do not buy/configure services before their phase."

---

## 5. Repository structure

See `ARCHITECTURE.md` for the authoritative, currently-implemented
structure and the reasoning behind it.
