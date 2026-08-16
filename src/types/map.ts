/** Camera position for the map view. Shared by the 2D viewport today and
 * the 3D scaffold introduced in Phase 4 (pitch/bearing already modeled so
 * that transition doesn't require a shape change). */
export interface MapViewState {
  center: { lat: number; lng: number }
  zoom: number
  pitch: number
  bearing: number
}
