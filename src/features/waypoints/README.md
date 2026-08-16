# features/waypoints

**Status:** Phase 2, slice 2.1 done — create/edit/delete waypoints,
categories, notes, real local persistence. Slices 2.2 (dedicated list page
+ drag-to-move), 2.3 (GPS track recording) and 2.4 (waypoint photos) are
not started; `WaypointsPage` is still a placeholder.

Creation currently happens from the Map page (`components/WaypointControl.tsx`
arms "placing" mode, a tap on the map calls `waypointsStore.placeWaypointAt`)
rather than the dedicated Waypoints page — that page is slice 2.2's job.

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
opens the same edit panel.

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
`WaypointEditPanel`'s picker uses the real `lucide-react` components (a
React tree), while `MapLibreProvider`'s `CATEGORY_ICON_INNER` has the same
icons' raw SVG path data as strings (a MapLibre marker is a plain DOM
element outside React, and this file must stay framework-agnostic — only
`maplibre-gl` may be imported there). Keep both in sync when adding a
category.
