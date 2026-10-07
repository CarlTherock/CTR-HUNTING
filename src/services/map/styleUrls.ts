import type { MapBaseLayerId } from '@/types'

export interface MapLibreProviderApiKeys {
  /** MapTiler ("outdoor", "satellite"). Get one at
   * https://cloud.maptiler.com/account/keys/ */
  mapTiler?: string
  /** Esri (every "esri-*" base layer) — an ArcGIS Location Platform API
   * key scoped to the "Basemaps" privilege only. Get one at
   * https://developers.arcgis.com. */
  esri?: string
}

/** Esri Basemap Styles v2 style name for each "esri-*" base layer —
 * https://developers.arcgis.com/rest/basemap-styles/. Picked for what the
 * roadmap actually needs, not "every style Esri has": topographic/imagery
 * mirror MapTiler as an alternate vendor; terrain + hillshade give relief
 * context ahead of Phase 4's real 3D terrain; light-gray/dark-gray are the
 * standard neutral canvases Phase 8–9's analytics heatmaps get drawn on;
 * navigation is road-focused for finding access routes. */
const ESRI_STYLE_NAME: Record<
  Exclude<MapBaseLayerId, 'outdoor' | 'satellite'>,
  string
> = {
  'esri-topographic': 'topographic',
  'esri-imagery': 'imagery',
  'esri-imagery-standard': 'imagery/standard',
  'esri-terrain': 'terrain',
  'esri-hillshade': 'hillshade/light',
  'esri-light-gray': 'light-gray',
  'esri-dark-gray': 'dark-gray',
  'esri-navigation': 'navigation',
}

/** Style JSON URL for a base layer — always just a URL swap regardless of
 * vendor (MapTiler and Esri Basemap Styles v2 both serve MapLibre style
 * JSON). */
export function buildStyleUrl(
  apiKeys: MapLibreProviderApiKeys,
  layer: MapBaseLayerId,
): string {
  switch (layer) {
    case 'outdoor':
      return `https://api.maptiler.com/maps/outdoor/style.json?key=${apiKeys.mapTiler}`
    case 'satellite':
      return `https://api.maptiler.com/maps/satellite/style.json?key=${apiKeys.mapTiler}`
    default:
      return `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/${ESRI_STYLE_NAME[layer]}?token=${apiKeys.esri}`
  }
}
