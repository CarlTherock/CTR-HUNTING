import type { Map as MapLibreMap } from 'maplibre-gl'

/** Terrain DEM source (Phase 4). AWS's public "Terrarium" elevation
 * tiles — real, verified, no API key required (registry.opendata.aws/
 * terrain-tiles/). Deliberately not MapTiler's `terrain-rgb-v2`: its
 * RGB-decoding convention (Mapbox-compatible vs. something else) isn't
 * documented anywhere this session could verify, and this project's
 * hard rule is to never guess a technical fact like that — Terrarium's
 * encoding is unambiguous and MapLibre supports it natively
 * (`encoding: 'terrarium'`). Terrain is independent of the active base
 * layer/vendor (it's a separate draped mesh, not part of the visual
 * style), so this works the same under any base layer. */
const TERRAIN_SOURCE_ID = 'terrain-dem'
const TERRAIN_TILE_URL =
  'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

/** Adds the DEM source and sets terrain on it. Called on every style load
 * — a base layer switch must never silently drop terrain. Terrain is
 * *always* set, never `null`, even in "2D": MapLibre's `queryTerrainElevation`
 * "Returns null if terrain is not enabled," which used to make every
 * elevation query (terrain info, elevation profile, Phase 8/9 analyzers and
 * heatmap cells) silently return null outside 3D view. In 2D, exaggeration
 * is simply held at 1 (true scale) — with pitch 0 that looks flat anyway. */
export function applyTerrain(map: MapLibreMap, exaggeration: number): void {
  map.addSource(TERRAIN_SOURCE_ID, {
    type: 'raster-dem',
    tiles: [TERRAIN_TILE_URL],
    tileSize: 256,
    encoding: 'terrarium',
    maxzoom: 15,
  })
  setTerrainExaggeration(map, exaggeration)
}

export function setTerrainExaggeration(map: MapLibreMap, exaggeration: number): void {
  map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration })
}
