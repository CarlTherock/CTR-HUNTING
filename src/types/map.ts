/** Camera position for the map view. Shared by the 2D viewport today and
 * the 3D scaffold introduced in Phase 4 (pitch/bearing already modeled so
 * that transition doesn't require a shape change). */
export interface MapViewState {
  center: { lat: number; lng: number }
  zoom: number
  pitch: number
  bearing: number
}

/** A selectable base map. Phase 1 slice 1.2 offers two real MapTiler
 * styles; independently-toggleable overlays (trails, hydrography, contour
 * lines) are slice 1.4 — a base layer is always exactly one active style,
 * not a set of overlays. */
export type MapBaseLayerId = 'outdoor' | 'satellite'

export interface MapBaseLayerOption {
  id: MapBaseLayerId
  label: string
}
