# features/waypoints

**Status:** Phase 2 complete — all four slices done: create/edit/delete/
drag-to-move waypoints (2.1/2.2), categories, notes, a dedicated list
page, GPS track recording (2.3), and waypoint photos (2.4), all with
real local persistence.

Waypoint/track *creation* still only happens from the Map page — a
waypoint needs a tap-on-map position (`components/WaypointControl.tsx`
arms "placing" mode, a tap on the map calls
`waypointsStore.placeWaypointAt`), and a track needs a live GPS feed
(`components/TrackRecorderControl.tsx`). `pages/WaypointsPage.tsx` is
read/edit/delete only: every saved waypoint and recorded track, listed
for review — tapping a waypoint row opens the same
`WaypointEditPanel` the Map page uses (it's driven entirely by
`waypointsStore.editingId`, so it works unchanged from either page).

`state/waypointsStore.ts` (zustand) holds the in-memory waypoint list plus
UI state (`isPlacing`, `editingId`); every mutation writes through to
`src/database/waypointsRepository.ts` (Dexie) first, so the store is never
out of sync with what's actually persisted. There is no separate "unsaved
draft" concept — tapping the map creates a real, persisted waypoint
immediately (default name, category "general"), then opens
`components/WaypointEditPanel.tsx` to customize or delete it. That panel
holds its own local draft while open; only "Save" writes it through.

Markers are rendered by `MapInstance.setWaypoints()`
(`src/services/map/`) — a white circle with a black category icon inside
a colored ring, visually distinct from the round green GPS dot. Tapping
an existing marker calls the map's `onWaypointClick` callback, which just
opens the same edit panel. Markers are also **draggable** — dropping one
calls `onWaypointDragEnd`, which `MapPage` wires straight into
`waypointsStore.updateWaypoint(id, { coordinate })`, so a drag is
persisted the same way any other edit is (no separate "confirm move"
step).

`categories.ts` holds `CATEGORY_OPTIONS`/`COLOR_OPTIONS`/`CATEGORY_LABEL`/
`CATEGORY_ICON`, shared between `WaypointEditPanel` (the picker) and
`WaypointsPage` (the list), so both always show the same icon/label per
category.

## Categories and colors

`WaypointCategory` (`src/types/geo.ts`) has 14 hunting-specific values
(stand/blind, trail camera, food plot, water, bedding area, game sign,
kill site, trailhead, parking, campsite, hazard, gate, custom, general) —
deliberately more granular than a single generic pin, matching how
reference hunting-GPS apps (onX Hunt, HuntStand) let a hunter distinguish
"a stand" from "a trail camera" from "a water source" at a glance.
`WaypointColor` is a fixed 8-color preset (not a free-form picker), so
markers stay visually consistent.

Each category's icon is defined **twice on purpose**, not by accident:
`categories.ts` (`WaypointEditPanel`'s picker, `WaypointsPage`'s list)
uses the real `lucide-react` components (a React tree), while
`MapLibreProvider`'s `CATEGORY_ICON_INNER` has the same icons' raw SVG
path data as strings (a MapLibre marker is a plain DOM element outside
React, and that file must stay framework-agnostic — only `maplibre-gl`
may be imported there). Keep both in sync when adding a category.

## GPS track recording (slice 2.3)

`state/tracksStore.ts` (zustand) tracks `status` (`idle`/`recording`/
`paused`), the in-progress `points`/`distanceMeters`, and the list of
saved tracks — all backed by `src/database/tracksRepository.ts` (Dexie).
Unlike waypoints (persisted once, on creation), a track is persisted
**incrementally**: `start()` writes an empty track the moment recording
begins, and every accepted GPS sample re-writes its `points`/
`distanceMeters` immediately — so a crash mid-hunt loses at most the last
unsaved sample, not the whole walk, matching the project's offline-first
"never lose real data" posture.

`MapPage` feeds GPS samples in via `useGeolocation()` → `addPoint()`, and
mirrors the in-progress track onto the map live via
`MapInstance.setTrackPreview()` — a blue line layer that's re-added after
every base-layer switch (`setStyle()` wipes custom sources/layers, same
issue the overlay layers already solve for). Samples closer than 5 m to
the last recorded point are dropped as GPS jitter, not real movement
(`MIN_POINT_DISTANCE_METERS` in `tracksStore.ts`) — distance/duration
would otherwise creep up while the hunter stands still.

Distance is computed with the Haversine formula
(`src/utils/geo.ts`) — accurate enough for on-foot distances, no need for
a heavier ellipsoidal model. `components/TrackRecorderControl.tsx` is the
floating start/pause/resume/stop control (opposite corner from
`WaypointControl` so the two never overlap) and shows live elapsed
time/distance while recording.

Not built yet (noted, not implemented): trimming a track after the fact
(removing trailing points, e.g. the truck ride home) and rendering a past
(non-active) track back onto the map — both flagged as follow-ups in
`NOTES_TECHNIQUES_FUTURES.md` from the onX Hunt/HuntStand research, not
required for this slice.

## Waypoint photos (slice 2.4)

`components/WaypointPhotos.tsx`, rendered inside `WaypointEditPanel`.
`src/database/photosRepository.ts` (Dexie `photos` table, added via a
`db.version(2).stores(...)` bump in `db.ts`) stores each photo as a real
`Blob` — not a base64 data URL, smaller on disk and no encode/decode
round-trip for something already binary. A photo's `<img>` is shown via
`URL.createObjectURL(photo.blob)`, created/revoked alongside whatever
loads or changes the photo list (the initial Dexie load, `handleFileChange`,
`handleDelete`) rather than through a second effect purely deriving from
state — see `WaypointPhotos.tsx`'s comments for why: React's rules
discourage a synchronous `setState` call in an effect body outside a
subscription callback, which a naive "recompute all object URLs whenever
`photos` changes" effect would be.

Adding a photo is a plain `<input type="file" accept="image/*"
capture="environment">` — it delegates entirely to the device's own
camera/gallery picker. This is **not** Phase 12's camera tool (live
preview, zoom, exposure, filters); slice 2.4 only needs to attach an
already-taken photo to a waypoint, matching "don't build ahead of the
roadmap."

`Waypoint.photoIds` (`src/types/geo.ts`) stays in sync with the `photos`
table so `WaypointsPage`'s list can show a photo count per waypoint
without querying the photos table at all — just `photoIds.length`.
Deleting a waypoint (`waypointsStore.deleteWaypoint`) also deletes its
photos (`deletePhotosForWaypoint`) — without that they'd be orphaned in
Dexie forever, since nothing else references them.
