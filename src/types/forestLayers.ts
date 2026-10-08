/**
 * Real public Québec government map layers — Forêt ouverte / MRNF (WMS),
 * the Québec cadastre, the "Territoires récréatifs du Québec" (TRQ) and the
 * Registre des aires protégées (both ArcGIS REST). Each is added to the map
 * as a raster overlay (`MapInstance.setRasterOverlay`), never a fabricated
 * boundary. Every source is documented in `docs/SOURCES_QUEBEC.md`.
 */
export type ForestLayerId =
  | 'cadastre'
  | 'coupes-forestieres'
  | 'peuplements-ecoforestiers'
  | 'lidar-ombre'
  | 'lidar-acquisition'
  | 'trq-faune'
  | 'trq-parcs'
  | 'aires-protegees'

/** Panel sections: forest reference data, LiDAR relief, legal boundaries. */
export type ForestLayerGroup = 'foret' | 'relief' | 'frontieres'

/** Load state of one raster overlay, as seen by the map engine. */
export type OverlayLoadState = 'idle' | 'loading' | 'ready' | 'error'

/** Why a map layer failed — see `services/map/layerErrors.ts`. */
export type LayerErrorKind =
  | 'missing-key'
  | 'provider-refused'
  | 'style-unavailable'
  | 'tile-failure'
  | 'layer-not-found'
  | 'bad-params'
  | 'incompatible'
  | 'not-offline'
  | 'unknown'

export interface OverlayStatus {
  state: OverlayLoadState
  /** Human-readable reason, French, only for `error`. */
  message?: string
  /** Typed cause, only for `error` (older callers may omit it). */
  errorKind?: LayerErrorKind
}

export interface ForestLayerOption {
  id: ForestLayerId
  label: string
  description: string
  group: ForestLayerGroup
  /** Attribution text required by the licence, shown on the map. */
  attribution: string
  /** Short licence label, e.g. "CC-BY 4.0". */
  license: string
  /** Honest note on coverage / freshness (never claims "à jour" without a
   * published date). */
  dataNote: string
  /** Official page about the dataset. */
  sourceUrl: string
  /** Legal boundary: the UI shows the "a boundary is not a hunting right"
   * warning and the official links whenever it is enabled. */
  legalBoundary?: boolean
  /** The service draws nothing when zoomed further out than this. */
  minZoom?: number
  /** Plain-text legend (the service legend image is not verified). */
  legend?: string
}
