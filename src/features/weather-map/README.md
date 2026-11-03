# features/weather-map

Weather-app-style map: animated radar and forecast rasters on a timeline,
like MétéoMédia / Windy, drawn from **real gridded data** only.

## Source (verified live)

Environment and Climate Change Canada, MSC GeoMet WMS 1.3.0
(`https://geo.weather.gc.ca/geomet`, CORS `*`, no key).

| Chip     | WMS layer(s)                                  | Kind                | Step                        |
| -------- | --------------------------------------------- | ------------------- | --------------------------- |
| Radar    | `RADAR_1KM_RRAI` + `RADAR_1KM_RSNO` (stacked) | observed, 3 h back  | 12 min shown (6 min native) |
| Précip.  | `HRDPS.CONTINENTAL.DIAG_PR_PT1H`              | forecast            | 1 h, ~48 h                  |
| Temp.    | `HRDPS.CONTINENTAL_TT`                        | forecast            | 1 h                         |
| Vent     | `HRDPS.CONTINENTAL_WSPD`                      | forecast            | 1 h                         |
| Rafales  | `HRDPS.CONTINENTAL_WGE`                       | forecast            | 1 h                         |
| Nuages   | `HRDPS.CONTINENTAL_NT`                        | forecast            | 1 h                         |
| Pression | `HRDPS.CONTINENTAL_PN`                        | forecast (contours) | 1 h                         |

Gotchas found while testing:

- GeoMet rejects several layers in one GetMap (`InvalidLayersParameter`),
  so radar rain and snow are two stacked raster sources per frame.
- The radar window rolls every 6 min; the 3 oldest instants are skipped
  so a frame never expires while being watched (an expired time returns
  an XML ServiceException, not a PNG).
- RainViewer (previous source) returns blank tiles above zoom 7: removed.

## Pieces

- `services/weather-map/GeoMetProvider.ts` — capabilities → frames,
  tile / legend URLs, `GetFeatureInfo` value at the map center (`null`
  = no echo, never a fabricated 0).
- `state/weatherMapStore.ts` — layer, frames, index, playback, opacity,
  per-layer cache (5 min observed, 30 min forecast).
- `useWeatherMapEffects.ts` — playback (waits for tiles), radar refresh,
  center value, syncs the Open-Meteo particle hour with the timeline.
- `components/WeatherMapControl.tsx` — iPhone: bottom panel that folds to a
  compact row (layer, time, play/pause); wide screens (≥ 1024 px): side
  panel + wide timeline at the bottom of the map. Tabs « Couches » (layer
  list, legend, superimposed wind) and « Réglages » (opacity, wind
  presentation). Pieces: `LayerList`, `TimelineBar`, `WindStyleSettings`.
- `layerPresentation.ts` — icon + one-line description per real layer, and
  the groups « Observé » / « Précipitations prévues » / « Autres prévisions ».
- `timelineTicks.ts` — hour marks that fit the width; `TimelineBar` moves its
  readout while dragging but commits the map frame only when the finger
  rests (150 ms) or on release, so scrubbing does not request every frame.
- `windSync.ts` — says when the layer's instant is outside the wind
  forecast's period (the particles then keep their last hour; the panel says so).

## Wind presentation (visual only)

The wind is an animated particle field, not arrows. `utils/windStyle.ts` +
`state/windStyleStore.ts` (saved on the device, key `windStyle`, no network):

| Setting            | Values                      | What it changes                                             |
| ------------------ | --------------------------- | ----------------------------------------------------------- |
| Taille             | normal / grand / très grand | how long a trail stays on screen (fade 0.9 / 0.945 / 0.965) |
| Épaisseur          | fine / normale / épaisse    | stroke width 1.2 / 1.8 / 3.2 px                             |
| Densité            | faible / normale / élevée   | particle count 220 / 400 / 700                              |
| Contraste renforcé | on / off                    | dark halo under each stroke, opaque colours                 |

Size, thickness and density are independent. Nothing here changes a wind
value, the animation speed (`advancePosition`) or the dispersion maths; the
still image shown when paused is painted for as many frames as the trail needs.
A « Flèches » mode (direction visible at rest) is **not** implemented yet.

- The map engine (`MapLibreProvider.setWeatherFrames`) keeps a small
  window of frames loaded (1 behind, 3 ahead) and only flips opacity, so
  the animation doesn't flicker.

Offline: GeoMet tiles are excluded from the offline tile cache (live
data only); the panel shows the error state when offline.
