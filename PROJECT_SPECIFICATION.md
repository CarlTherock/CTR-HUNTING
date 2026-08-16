# Field Terrain Intelligence — Project Specification

**Status:** Phase 0 (Foundation) complete; Phase 1 (Map) in progress — slice
1.1 (base map) done
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
| 1   | Map (in progress)      | Interactive 2D map, zoom/pan, GPS, satellite/topo/trail/hydrography layers, contour lines, layer manager. Prepare 2D ↔ 3D from the start. Slices 1.1 (base map) and 1.2 (base layer switcher) done; 1.3–1.5 pending. |
| 2   | Waypoints & Tracks     | Create/edit/move/delete waypoints, categories, notes, photos; GPS track recording; distance/duration/altitude; local save.                                                                         |
| 3   | Offline                | Area selection, size estimate, download, progress, local storage, storage management, offline status, resync on reconnect.                                                                         |
| 4   | Terrain 3D             | 3D terrain, rotation/tilt/zoom/pan, orientation, altitude, slope, aspect, contour lines, elevation profile. Same layers/data as 2D.                                                                |
| 5   | Weather                | Temperature, humidity, pressure, precipitation, cloud cover, visibility, wind, gusts, hourly forecast. Provider must be swappable.                                                                 |
| 6   | Wind                   | Dedicated wind engine: direction, speed, gusts, temporal change, map animation, interactive timeline.                                                                                              |
| 7   | Temporal Data          | Sunrise/sunset, moonrise/moonset, moon phase, day length; global 24h timeline.                                                                                                                     |
| 8   | Analytics Engine       | Independent analyzers: TerrainAnalyzer, VegetationAnalyzer, WeatherAnalyzer, WindAnalyzer, TimeAnalyzer, HistoryAnalyzer. Results must be explainable.                                             |
| 9   | Analysis Map           | Heatmap, analyzed zones, configurable scores, explanatory factors, comparison. No result presented as certainty when data is probabilistic.                                                        |
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
| Mapping             | MapLibre GL JS (+ Three.js for 3D)  | ✅ base map in place (Phase 1, slice 1.1); tiles via MapTiler       |
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
