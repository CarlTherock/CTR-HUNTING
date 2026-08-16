# features/layers

**Status:** Phase 1 (slices 1.2, 1.4) plus a post-Phase-1 addition — base
layer switching, overlay toggles, and a second map vendor (Esri).
Per-layer opacity is not built yet.

`state/layersStore.ts` (zustand) holds which base layer is active and
which overlays are on; `components/LayerManagerPanel.tsx` is the floating
picker rendered over the map in `MapPage`, grouped by vendor (MapTiler /
Esri) and filtered to only the base layers whose API key is actually
configured (`availableBaseLayers`, `src/services/map/`). Switching the
base layer calls `MapInstance.setBaseLayer()`, toggling an overlay calls
`setOverlayVisible()` — neither recreates the map.

The panel collapses to a small icon button as soon as a base layer is
picked (ten options is a lot to leave covering a phone screen) — tap it
to reopen. Toggling an overlay does *not* collapse it, since that's more
of a "flip a few, one at a time" action than a single choice.

## Base layers

Ten base layers across two vendors, picked for what the app actually
needs rather than "every style available":

| Vendor   | Layer                                        | Why                                                   |
| -------- | --------------------------------------------- | ------------------------------------------------------ |
| MapTiler | Outdoor, Satellite                            | Original Phase 1 layers                                |
| Esri     | Topographic, Imagery Hybrid, Imagery          | Alternate vendor for the same core needs                |
| Esri     | Terrain, Hillshade                            | Relief context ahead of Phase 4's real 3D terrain       |
| Esri     | Light Gray, Dark Gray                         | Neutral canvases Phase 8–9's analytics heatmaps draw on |
| Esri     | Navigation                                    | Road-focused, for finding access routes                 |

Both vendors serve MapLibre-compatible style JSON, so `src/services/map/`
needs only one engine adapter (`MapLibreProvider`) for both — see that
file's own doc comment for the exact style endpoints and why each Esri
style was chosen.

## Overlays

Overlays only exist inside MapTiler's "Outdoor" style: trails,
hydrography and contours are real vector layers already inside that one
style (MapTiler doesn't expose them as separate style URLs), shown/hidden
by ID (`MapLibreProvider`'s `OVERLAY_LAYER_IDS`, extracted from the
style's own `style.json` — never invented layer names). They have no
effect on any other base layer (MapTiler "Satellite", any Esri style), so
`LayerManagerPanel` disables the overlay toggles rather than let them
silently do nothing while one of those is active.
