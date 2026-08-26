import type { ForestLayerId, ForestLayerOption } from '@/types'

/**
 * Real Québec government geospatial services — no key, no account,
 * CC-BY 4.0 (données Québec). Verified directly against each service's
 * own GetCapabilities/REST metadata this session (not assumed from
 * memory): `ori_pee_interventions` is the WMS layer backing the
 * "Récolte et autres interventions sylvicoles" dataset (Forêt ouverte's
 * own coupes-forestières layer — confirmed by fetching
 * `mffpecofor.fcgi`'s live GetCapabilities and finding this exact
 * `<Name>`), and `Cadastre_allege`'s layer 0 is "Lots du cadastre
 * rénové" (confirmed via that MapServer's own `?f=json` metadata).
 *
 * Tiled via the `{bbox-epsg-3857}` template MapLibre substitutes into a
 * raster source's tile URLs specifically for WMS/ArcGIS integration
 * (MapLibre's own documented "Add a WMS source" example uses the exact
 * same technique) — real per-tile requests to the real service, not a
 * synthesized overlay like the Phase 6 weather layer.
 */
const FORET_OUVERTE_WMS = 'https://geoegl.msp.gouv.qc.ca/ws/mffpecofor.fcgi'
const CADASTRE_ARCGIS_MAPSERVER =
  'https://geo.environnement.gouv.qc.ca/donnees/rest/services/Reference/Cadastre_allege/MapServer'

function wmsTileUrl(layerName: string): string {
  const url = new URL(FORET_OUVERTE_WMS)
  url.searchParams.set('SERVICE', 'WMS')
  url.searchParams.set('VERSION', '1.1.1')
  url.searchParams.set('REQUEST', 'GetMap')
  url.searchParams.set('LAYERS', layerName)
  url.searchParams.set('STYLES', '')
  url.searchParams.set('SRS', 'EPSG:3857')
  url.searchParams.set('WIDTH', '256')
  url.searchParams.set('HEIGHT', '256')
  url.searchParams.set('FORMAT', 'image/png')
  url.searchParams.set('TRANSPARENT', 'TRUE')
  // Added last, unencoded — MapLibre substitutes this exact token with
  // the tile's real bbox; letting URLSearchParams encode it (to
  // `%7Bbbox-epsg-3857%7D`) would break that substitution.
  return `${url.toString()}&BBOX={bbox-epsg-3857}`
}

export const FOREST_LAYER_OPTIONS: ForestLayerOption[] = [
  {
    id: 'cadastre',
    label: 'Cadastre',
    description: 'Lots du cadastre rénové du Québec (limites de propriété réelles)',
  },
  {
    id: 'coupes-forestieres',
    label: 'Coupes forestières',
    description: 'Interventions sylvicoles et récolte — Forêt ouverte (MRNF)',
  },
  {
    id: 'peuplements-ecoforestiers',
    label: 'Peuplements forestiers',
    description: 'Composition et âge des peuplements — carte écoforestière (MRNF)',
  },
]

export function forestLayerTileUrl(id: ForestLayerId): string {
  switch (id) {
    case 'cadastre':
      return `${CADASTRE_ARCGIS_MAPSERVER}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png32&transparent=true&f=image&layers=show:0`
    case 'coupes-forestieres':
      return wmsTileUrl('ori_pee_interventions')
    case 'peuplements-ecoforestiers':
      return wmsTileUrl('ori_pee_ori_prov')
  }
}
