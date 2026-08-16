# features/map

**Status:** Phase 1 complete — all five slices done: base map (1.1), layer
manager (1.2, in `features/layers/`), live GPS (1.3, in `features/gps/`),
additional overlay layers (1.4) and the 2D↔3D scaffold (1.5,
`components/ViewModeToggle.tsx`).

The 2D↔3D toggle only tilts/rotates the camera (`MapViewState.pitch`/
`bearing`, modeled in since slice 1.1) — there's no elevation exaggeration
yet. Real terrain data + MapLibre's `setTerrain` is Phase 4 ("same
layers/data as 2D" per the spec); this scaffold is what that phase plugs
into, not a preview of it.

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
