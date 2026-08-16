# features/layers

**Status:** Phase 1, slice 1.2 done — base layer switching (Outdoor /
Satellite). Independently-toggleable overlays (trails, hydrography,
contour lines, vector/raster opacity) are slice 1.4, not started.

`state/layersStore.ts` (zustand) holds which base layer is active;
`components/LayerManagerPanel.tsx` is the floating picker rendered over the
map in `MapPage`. Switching layers calls `MapInstance.setBaseLayer()`
(`src/services/map/`) rather than recreating the map.
