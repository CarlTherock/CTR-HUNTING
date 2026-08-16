# features/map

**Status:** Phase 1, slice 1.1 done — interactive base map (pan/zoom) via
MapTiler "Outdoor". Layer manager (1.2), live GPS (1.3), additional layers
(1.4) and the 2D↔3D scaffold (1.5) are separate, not-yet-implemented slices.

Interactive 2D/3D map: pan/zoom, GPS, satellite/topo/trail/hydrography base
layers, contour lines, layer manager. The map is a central, provider-agnostic
platform component (per project rules) — no feature couples directly to a
specific map SDK; `src/services/map/` (`MapProvider` interface,
`MapTilerProvider` implementation) is that adapter.

`state/mapStore.ts` holds the shared viewport (center/zoom/pitch/bearing) in
zustand — read by the map today, and by whatever else needs to react to or
drive the camera as later slices/phases are added.
