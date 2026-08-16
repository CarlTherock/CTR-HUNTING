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
(`src/services/map/`) — an amber teardrop pin, visually distinct from the
round green GPS dot. Tapping an existing marker calls the map's
`onWaypointClick` callback, which just opens the same edit panel.
