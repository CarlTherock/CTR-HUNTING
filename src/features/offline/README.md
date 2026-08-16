# features/offline

**Status:** Phase 3 complete — all four slices done: area selection +
real (calculated, not fabricated) tile-count estimate (3.1), download
with live progress (3.2), storage management (3.3), offline status +
manual resync (3.4).

Everything here lives on the **Map page** — a downloaded area needs a
live map to sweep for real tiles, so there's no separate "Offline" nav
page for *creating* areas. `SettingsPage` is the read/delete counterpart
(same "creation stays where the live resource is, management is
elsewhere" split as Phase 2's waypoints/tracks).

## How a download actually works

The hard constraint driving this design: **the app must never guess or
hard-code a map vendor's tile URL template** (MapTiler/Esri's real
per-tile URLs weren't something this session could verify live — no API
key available — and the project's "never fabricate technical facts" rule
means that's not a risk worth taking). So instead of constructing tile
URLs ourselves, `MapLibreProvider.downloadArea()`:

1. Computes the target tile grid for the selected bounds/zoom range using
   real slippy-map tile math (`src/utils/tiles.ts` —
   [OSM's standard formulas](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames),
   not invented).
2. **Sweeps the camera** across that grid (`map.jumpTo()` centered on each
   target tile, one at a time, waiting for MapLibre's own `'idle'` event)
   — this makes MapLibre issue its own real tile requests, using
   whatever URL template the active style actually has. We never parse or
   even see that template.
3. Every tile request is redirected (via MapLibre's `transformRequest`
   hook) from `https://…` to a custom `ctrtile://…` protocol, registered
   once via `addProtocol()`. That handler
   (`MapLibreProvider.ts`) checks `offline/tileCache.ts` (a thin Cache
   Storage API wrapper — real binary storage, not IndexedDB, which is for
   the small structured metadata) first; on a miss it fetches over the
   network, caches the response, and tallies it if a deliberate download
   is in progress.

**Known limitation, not verified live** (documented in code comments,
not silently assumed to work): MapLibre's own docs note a custom
protocol registered on the main thread may also need registering inside
its worker for requests the worker itself issues — vector tile parsing
runs there, and this app copies MapLibre's *stock* worker unmodified
(`vite.config.ts`). If real-device testing shows vector tiles bypass the
cache, that worker-side registration is the fix.

## State

`state/offlineStore.ts` (zustand) — `mode` (`idle` / `selecting` /
`downloading`), the frozen `selectedBounds`/`selectedZoom` (captured once
when the user arms selection, not re-read while they keep panning behind
the panel), and the list of `areas`. `startDownload` and `refreshArea`
(re-download an existing area's same bounds — the "resync" affordance)
share one `runDownload` helper so the persist/progress/cancel/error
handling isn't duplicated between "new area" and "refresh an old one."

Every `OfflineArea` (`src/database/offlineAreasRepository.ts`, Dexie)
keeps its own `tileUrls: string[]` — the exact set of URLs it downloaded
— so deleting one area removes precisely its tiles from Cache Storage,
never another (possibly overlapping) area's.

## UI

`components/OfflineAreaControl.tsx` — floating control on the Map page:
idle (a download button, plus a small "refresh" list for
already-downloaded areas matching the current base layer), selecting
(extra-zoom-levels stepper + real tile count + start), downloading (live
progress + cancel). `SettingsPage` lists completed/errored/cancelled
areas (in-progress ones stay on the Map page's own progress panel, not
duplicated here) with delete, plus real
`navigator.storage.estimate()` usage — never a guessed number.

`MapPage` also shows a plain "Offline — showing cached maps" badge when
`useOnlineStatus()` (`src/offline/`) reports offline — the map itself
still renders because Cache Storage keeps serving previously-downloaded
(or passively cached) tiles regardless of connectivity.
