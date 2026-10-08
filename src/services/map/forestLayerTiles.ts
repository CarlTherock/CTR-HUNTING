import type { ForestLayerId, ForestLayerOption } from '@/types'

/**
 * Real Québec government geospatial services — no key, no account,
 * CC-BY 4.0 (Données Québec) except where `docs/SOURCES_QUEBEC.md` says
 * otherwise. Service URLs, layer names and projections come from each
 * service's own GetCapabilities / ArcGIS REST metadata, read through
 * WebFetch (see that document for what was and was NOT verified — notably
 * CORS and actual tile rendering, which need a real browser).
 *
 * - Forêt ouverte WMS (`mffpecofor.fcgi`): `lidar_ombre`
 *   ("Relief ombré lidar (dégradé)") and `lidar_index_acquisition`
 *   ("Année d'acquisition du lidar") are listed in the current
 *   GetCapabilities. `ori_pee_interventions` / `ori_pee_ori_prov` were
 *   integrated earlier; they were NOT found in the readable part of the
 *   current capabilities (see the doc) — the map's error state would
 *   surface a dead layer.
 * - Cadastre_allege (ArcGIS REST): layer 0 "Lots du cadastre rénové".
 * - TRQ_WMS (ArcGIS REST, ministère des Ressources naturelles et des
 *   Forêts): 17 layers, ids below, native SR 102100 (= Web Mercator).
 * - Aires_protegees (ArcGIS REST, MELCCFP): layer 23 "Ensemble des aires
 *   protégées et autres mesures de conservation efficaces".
 *
 * Tiled via the `{bbox-epsg-3857}` template MapLibre substitutes into a
 * raster source's tile URLs (MapLibre's documented "Add a WMS source"
 * technique) — real per-tile requests to the real service.
 */
const FORET_OUVERTE_WMS = 'https://geoegl.msp.gouv.qc.ca/ws/mffpecofor.fcgi'
const CADASTRE_ARCGIS_MAPSERVER =
  'https://geo.environnement.gouv.qc.ca/donnees/rest/services/Reference/Cadastre_allege/MapServer'
const AIRES_PROTEGEES_MAPSERVER =
  'https://geo.environnement.gouv.qc.ca/donnees/rest/services/Biodiversite/Aires_protegees/MapServer'
const TRQ_MAPSERVER =
  'https://servicescarto.mrnf.gouv.qc.ca/pes/rest/services/Territoire/TRQ_WMS/MapServer'

/** TRQ layer ids (from the service's own `?f=json`): territoires où la faune
 * est gérée ou où des droits de chasse particuliers existent. */
export const TRQ_FAUNE_LAYER_IDS = [0, 8, 9, 10, 11, 12, 15, 16] as const
/** TRQ layer ids: parcs et réserves écologiques. */
export const TRQ_PARCS_LAYER_IDS = [3, 4, 5, 6, 13] as const

/** Aires protégées: "Ensemble des aires protégées et AMCE". */
export const AIRES_PROTEGEES_LAYER_ID = 23

export const WARNING_FRONTIERE =
  'Une frontière ne prouve pas un droit de chasse : l’accès, les saisons, l’espèce et les restrictions sont distincts.'

/** Official hunting information (quebec.ca / Données Québec). */
export const OFFICIAL_HUNTING_LINKS: { label: string; href: string }[] = [
  {
    label: 'Règles de chasse dans certains territoires (quebec.ca)',
    href: 'https://www.quebec.ca/tourisme-loisirs-sport/activites-sportives-et-de-plein-air/chasse-sportive/regles-particulieres/regles-territoires',
  },
  {
    label: 'Cartes des zones de chasse (quebec.ca)',
    href: 'https://www.quebec.ca/tourisme-loisirs-sport/activites-sportives-et-de-plein-air/chasse-sportive/cartes-zones',
  },
]

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

/** ArcGIS REST `export` tile URL for a MapServer, showing only `layerIds`. */
export function arcgisExportTileUrl(
  mapServer: string,
  layerIds: readonly number[],
): string {
  return `${mapServer}/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&format=png32&transparent=true&f=image&layers=show:${layerIds.join(',')}`
}

const GOUV_QC = '© Gouvernement du Québec'

export const FOREST_LAYER_OPTIONS: ForestLayerOption[] = [
  {
    id: 'cadastre',
    label: 'Cadastre',
    description: 'Lots du cadastre rénové du Québec (limites de propriété réelles)',
    group: 'foret',
    attribution: `${GOUV_QC} — Cadastre`,
    license: 'CC-BY 4.0',
    dataNote:
      'Limites de lots, pas un titre de propriété ni un droit d’accès. Date de mise à jour non publiée dans le service.',
    sourceUrl: CADASTRE_ARCGIS_MAPSERVER,
  },
  {
    id: 'coupes-forestieres',
    label: 'Coupes forestières',
    description: 'Interventions sylvicoles et récolte — Forêt ouverte (MRNF)',
    group: 'foret',
    attribution: `${GOUV_QC} — Forêt ouverte (MRNF)`,
    license: 'CC-BY 4.0',
    dataNote:
      'Jeu de données mis à jour annuellement (Données Québec). Le nom de couche WMS doit être revérifié : voir docs/SOURCES_QUEBEC.md.',
    sourceUrl: 'https://www.donneesquebec.ca/recherche/dataset/recolte-et-reboisement',
  },
  {
    id: 'peuplements-ecoforestiers',
    label: 'Peuplements forestiers',
    description: 'Composition et âge des peuplements — carte écoforestière (MRNF)',
    group: 'foret',
    attribution: `${GOUV_QC} — Forêt ouverte (MRNF)`,
    license: 'CC-BY 4.0',
    dataNote:
      'Le nom de couche WMS doit être revérifié : voir docs/SOURCES_QUEBEC.md. Aucune date de mise à jour n’est affichée par le service.',
    sourceUrl:
      'https://ouvert.canada.ca/data/fr/dataset/baad3bb6-5879-4e34-a4a6-a43212706cb7',
  },
  {
    id: 'lidar-ombre',
    label: 'Relief ombré LiDAR',
    description: 'Ombrage du terrain issu du LiDAR — Forêt ouverte (MRNF)',
    group: 'relief',
    attribution: `${GOUV_QC} — MRNF, produits dérivés du LiDAR`,
    license: 'CC-BY 4.0',
    dataNote:
      'Couvre la quasi-totalité du sud du Québec seulement. Affichage « dégradé » par le service : la résolution des fichiers téléchargeables (2 m) n’est pas celle de cette carte. L’année d’acquisition varie selon le secteur (couche « Année d’acquisition ») ; la carte n’est pas garantie à jour.',
    sourceUrl:
      'https://ouvert.canada.ca/data/fr/dataset/5e5d2750-d129-4952-b9fc-f824c5e480b4',
    minZoom: 9,
    legend:
      'Ombrage gris : zones claires = pentes éclairées, zones sombres = pentes à l’ombre. Ce n’est pas une altitude.',
  },
  {
    id: 'lidar-acquisition',
    label: 'Année d’acquisition du LiDAR',
    description: 'Contours des territoires par année de relevé LiDAR (couverture)',
    group: 'relief',
    attribution: `${GOUV_QC} — MRNF, produits dérivés du LiDAR`,
    license: 'CC-BY 4.0',
    dataNote:
      'Montre où et quand le LiDAR a été relevé (année par territoire). La légende officielle des couleurs est dans Forêt ouverte.',
    sourceUrl:
      'https://ouvert.canada.ca/data/fr/dataset/5e5d2750-d129-4952-b9fc-f824c5e480b4',
    legend: 'Couleurs = année d’acquisition (légende officielle sur Forêt ouverte).',
  },
  {
    id: 'trq-faune',
    label: 'Territoires fauniques',
    description: 'ZEC, pourvoiries à droits exclusifs, réserves et refuges fauniques…',
    group: 'frontieres',
    attribution:
      '© Gouvernement du Québec — ministère des Ressources naturelles et des Forêts (TRQ)',
    license: 'CC-BY 4.0',
    dataNote:
      'Couche des territoires récréatifs du Québec (mise à jour « au besoin », dernière : 2026-09-02 selon Données Québec). Inclut : aire faunique communautaire, pourvoirie à droits exclusifs, refuge d’oiseaux migrateurs, refuge faunique, réserve faunique, réserve nationale de faune, territoire exclusif de chasse, ZEC. Les diffuseurs ne garantissent pas l’exactitude.',
    sourceUrl:
      'https://www.donneesquebec.ca/recherche/dataset/couche-des-territoires-recreatifs-du-quebec',
    legalBoundary: true,
    legend:
      'Couleurs et symboles : ceux du service gouvernemental (légende officielle sur Forêt ouverte).',
  },
  {
    id: 'trq-parcs',
    label: 'Parcs et réserves écologiques',
    description: 'Parcs nationaux, parcs régionaux, parcs marins, réserves écologiques',
    group: 'frontieres',
    attribution:
      '© Gouvernement du Québec — ministère des Ressources naturelles et des Forêts (TRQ)',
    license: 'CC-BY 4.0',
    dataNote:
      'Couche des territoires récréatifs du Québec (dernière mise à jour : 2026-09-02 selon Données Québec). La chasse y est généralement interdite ou très encadrée : consultez les règles officielles.',
    sourceUrl:
      'https://www.donneesquebec.ca/recherche/dataset/couche-des-territoires-recreatifs-du-quebec',
    legalBoundary: true,
    legend: 'Couleurs et symboles : ceux du service gouvernemental.',
  },
  {
    id: 'aires-protegees',
    label: 'Aires protégées',
    description:
      'Registre des aires protégées et autres mesures de conservation (MELCCFP)',
    group: 'frontieres',
    attribution: '© Gouvernement du Québec — MELCCFP, Registre des aires protégées',
    license: 'CC-BY 4.0',
    dataNote:
      'Données du registre arrêtées au 2026-03-31, mises à jour semestriellement (Données Québec). Le service ne publie pas de date propre.',
    sourceUrl: 'https://www.donneesquebec.ca/recherche/dataset/aires-protegees-au-quebec',
    legalBoundary: true,
    legend: 'Couleurs et symboles : ceux du service gouvernemental.',
  },
]

export function forestLayerTileUrl(id: ForestLayerId): string {
  switch (id) {
    case 'cadastre':
      return arcgisExportTileUrl(CADASTRE_ARCGIS_MAPSERVER, [0])
    case 'coupes-forestieres':
      return wmsTileUrl('ori_pee_interventions')
    case 'peuplements-ecoforestiers':
      return wmsTileUrl('ori_pee_ori_prov')
    case 'lidar-ombre':
      return wmsTileUrl('lidar_ombre')
    case 'lidar-acquisition':
      return wmsTileUrl('lidar_index_acquisition')
    case 'trq-faune':
      return arcgisExportTileUrl(TRQ_MAPSERVER, TRQ_FAUNE_LAYER_IDS)
    case 'trq-parcs':
      return arcgisExportTileUrl(TRQ_MAPSERVER, TRQ_PARCS_LAYER_IDS)
    case 'aires-protegees':
      return arcgisExportTileUrl(AIRES_PROTEGEES_MAPSERVER, [AIRES_PROTEGEES_LAYER_ID])
  }
}

export function forestLayerOption(id: ForestLayerId): ForestLayerOption {
  const option = FOREST_LAYER_OPTIONS.find((candidate) => candidate.id === id)
  if (!option) throw new Error(`Couche inconnue : ${id}`)
  return option
}
