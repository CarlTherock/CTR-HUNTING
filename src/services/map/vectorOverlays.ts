import type { Map as MapLibreMap } from 'maplibre-gl'
import type { MapOverlayId } from '@/types'

/** Real vector layer IDs inside MapTiler's "Outdoor" style, grouped by
 * overlay. MapTiler doesn't expose trails/hydrography/contours as
 * separate style URLs, so toggling them means hiding/showing layers that
 * already exist in this one style — extracted from the style's own
 * `style.json` (`layers[].id`), not invented. No other base layer
 * (MapTiler "Satellite", either Esri style) has these layers;
 * `setOverlayVisible` no-ops there. */
const OVERLAY_LAYER_IDS: Record<MapOverlayId, string[]> = {
  contours: ['contour_index', 'contour', 'contour_label'],
  hydrography: [
    'water',
    'water_intermittent',
    'waterway_tunnel',
    'waterway_river',
    'waterway_river_intermittent',
    'waterway_other',
    'waterway_other_intermittent',
    'water_name_line',
    'water_name_point',
    'water_name_way',
    'outdoor_poi_waterfall',
    'outdoor_poi_drinking_water',
  ],
  trails: [
    'tunnel_road_path',
    'road_path_casing',
    'road_path',
    'road_label_track',
    'trail_longdistance_casing',
    'trail_longdistance',
    ...(
      ['yellow', 'green', 'blue', 'brown', 'black', 'purple', 'orange', 'red'] as const
    ).flatMap((color) => [
      `trail_${color}_casing`,
      `trail_${color}_casing_extra`,
      `trail_${color}`,
      `trail_${color}_extra`,
    ]),
  ],
}

/** Applies one overlay's visibility to whichever of its layers actually
 * exist in the currently-loaded style — silently does nothing for layers
 * that aren't there (e.g. any overlay against a non-"Outdoor" style). */
export function applyOverlay(
  map: MapLibreMap,
  overlay: MapOverlayId,
  visible: boolean,
): void {
  for (const layerId of OVERLAY_LAYER_IDS[overlay]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }
}
