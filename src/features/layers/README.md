# features/layers

**Status:** Phase 1, slices 1.2 and 1.4 done — base layer switching
(Outdoor / Satellite) and overlay toggles (trails, hydrography, contour
lines). Per-layer opacity is not built yet.

`state/layersStore.ts` (zustand) holds which base layer is active and
which overlays are on; `components/LayerManagerPanel.tsx` is the floating
picker rendered over the map in `MapPage`. Switching the base layer calls
`MapInstance.setBaseLayer()`, toggling an overlay calls
`setOverlayVisible()` (both `src/services/map/`) — neither recreates the
map.

Overlays only exist inside the "Outdoor" style: MapTiler doesn't expose
trails/hydrography/contours as separate style URLs, so they're real
vector layers already inside that one style, shown/hidden by ID
(`MapTilerProvider`'s `OVERLAY_LAYER_IDS`, extracted from the style's own
`style.json` — never invented layer names). They have no effect on
"Satellite" (a plain raster style with no such layers), so
`LayerManagerPanel` disables the overlay toggles rather than let them
silently do nothing while it's active.
