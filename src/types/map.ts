/** Camera position for the map view. Shared by the 2D viewport today and
 * the 3D scaffold introduced in Phase 4 (pitch/bearing already modeled so
 * that transition doesn't require a shape change). */
export interface MapViewState {
  center: { lat: number; lng: number }
  zoom: number
  pitch: number
  bearing: number
}

/** A selectable base map. MapTiler ("outdoor", "satellite", slice 1.2) and
 * Esri (the "esri-*" ids, added post-Phase-1) are separate vendors but the
 * same MapLibre engine underneath — switching is just a style-URL swap
 * either way (`MapInstance.setBaseLayer`). The Esri set was picked for
 * what upcoming phases actually need, not "every style Esri has":
 * topographic/imagery mirror MapTiler as an alternate vendor, "terrain"
 * gives relief shading ahead of Phase 4's real 3D terrain, "light-gray"/
 * "dark-gray" are the standard neutral canvases the Phase 8–9 analytics
 * heatmaps get drawn on, and "navigation" is road-focused for finding
 * access routes.
 *
 * Independently-toggleable overlays (trails, hydrography, contour lines,
 * slice 1.4) are a separate concept — a base layer is always exactly one
 * active style, not a set of overlays, and MapTiler-only (Esri's styles
 * have no equivalent layers to toggle). */
export type MapBaseLayerId =
  | 'outdoor'
  | 'satellite'
  | 'esri-topographic'
  | 'esri-imagery'
  | 'esri-imagery-standard'
  | 'esri-terrain'
  | 'esri-hillshade'
  | 'esri-light-gray'
  | 'esri-dark-gray'
  | 'esri-navigation'

export interface MapBaseLayerOption {
  id: MapBaseLayerId
  label: string
}

/** An independently-toggleable overlay (slice 1.4). These are real vector
 * layers already present inside the "Outdoor" base style (MapTiler doesn't
 * expose them as separate style URLs), so they only have an effect while
 * that base layer is active — the "Satellite" style has no equivalent
 * layers to show or hide. */
export type MapOverlayId = 'trails' | 'hydrography' | 'contours'

export interface MapOverlayOption {
  id: MapOverlayId
  label: string
}
