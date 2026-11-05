/**
 * Weather-app-style map layers (radar + model forecast), rendered as
 * real raster imagery from Environment and Climate Change Canada's
 * MSC GeoMet WMS (geo.weather.gc.ca) — official, free, keyless, CORS
 * enabled, verified live. Every pixel is the real published product
 * (1 km radar composite, HRDPS 2.5 km model), never a value this app
 * interpolated or made up.
 */
export type WeatherMapLayerId =
  'radar' | 'precipitation' | 'temperature' | 'wind' | 'gusts' | 'clouds' | 'pressure'

/** `observed` = real radar measurement; `forecast` = HRDPS model output.
 * Always surfaced in the UI, never blurred together. */
export type WeatherFrameKind = 'observed' | 'forecast'

export interface WeatherMapFrame {
  /** ISO 8601 UTC instant, exactly as advertised by GeoMet's `time`
   * dimension — sent back verbatim as the WMS `TIME` parameter. */
  time: string
  kind: WeatherFrameKind
  /** Radar only: ECCC's extrapolation of the radar (a calculation moving the
   * echoes forward), not an observation. Always `kind: 'forecast'`. */
  extrapolated?: boolean
  /** Radar only: a frame of the HRDPS model's rain forecast, used after the
   * extrapolation ends (hourly, 1 h accumulation) — a model, not the radar. */
  modelForecast?: boolean
  /** WMS layers / styles of this frame when they differ from the layer's own
   * (the extrapolation layers). */
  wmsLayers?: string[]
  styles?: string[]
}

/** One frame as the map engine needs it: a stable key + one real tile
 * URL template per WMS layer (`{bbox-epsg-3857}` substituted per tile by
 * MapLibre). Several templates = drawn stacked (radar rain + snow):
 * GeoMet rejects multi-layer GetMap requests (verified live:
 * `InvalidLayersParameter`), so each layer is its own raster source. */
export interface WeatherTileFrame {
  key: string
  tileUrlTemplates: string[]
  /** Highest zoom tiles are requested at; above it the map enlarges them
   * smoothly (bilinear) instead of showing the source grid as blocks. */
  maxZoom?: number
}
