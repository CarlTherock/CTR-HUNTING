# features/map

**Status:** placeholder UI only — full implementation planned for **Phase 1**.

Interactive 2D/3D map: pan/zoom, GPS, satellite/topo/trail/hydrography base
layers, contour lines, layer manager. The map is a central, provider-agnostic
platform component (per project rules) — no feature couples directly to a
specific map SDK; a `src/services/map/` adapter is introduced in Phase 1.
