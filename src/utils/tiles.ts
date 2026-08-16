/** Slippy-map (XYZ) tile math — the standard formulas used by every
 * OSM/MapLibre/Mapbox-style tile scheme
 * (https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames), not
 * invented for this project. Used to calculate how many tiles a given
 * area/zoom range covers, for real (not fabricated) size estimates and
 * for driving an offline-area download. */

export interface LngLatBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TileXY {
  x: number
  y: number
}

export interface TileRange {
  zoom: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function clampLat(lat: number): number {
  // The Web Mercator projection is undefined at the poles — real tile
  // schemes clamp to its actual usable range.
  return Math.max(-85.05112878, Math.min(85.05112878, lat))
}

/** The tile that contains a given point, at a given zoom. */
export function lngLatToTile(lng: number, lat: number, zoom: number): TileXY {
  const n = 2 ** zoom
  const latRad = (clampLat(lat) * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  )
  return {
    x: Math.min(n - 1, Math.max(0, x)),
    y: Math.min(n - 1, Math.max(0, y)),
  }
}

/** The inclusive range of tile x/y covering `bounds` at `zoom`. */
export function tileRangeForBounds(bounds: LngLatBounds, zoom: number): TileRange {
  const topLeft = lngLatToTile(bounds.west, bounds.north, zoom)
  const bottomRight = lngLatToTile(bounds.east, bounds.south, zoom)
  return {
    zoom,
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  }
}

export function tileCountForRange(range: TileRange): number {
  return (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1)
}

/** Total tile count for `bounds` across every zoom from `minZoom` to
 * `maxZoom` inclusive — what an "offline area" download actually needs
 * to fetch, one count per zoom level summed together. */
export function tileCountForBounds(
  bounds: LngLatBounds,
  minZoom: number,
  maxZoom: number,
): number {
  let total = 0
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    total += tileCountForRange(tileRangeForBounds(bounds, zoom))
  }
  return total
}

/** The north-west corner of tile (x, y) at `zoom` — the inverse of
 * `lngLatToTile`, same standard formula. */
export function tileToLngLat(x: number, y: number, zoom: number): { lng: number; lat: number } {
  const n = 2 ** zoom
  const lng = (x / n) * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))
  return { lng, lat: (latRad * 180) / Math.PI }
}

/** The geographic center of tile (x, y) at `zoom` — used to point a
 * camera at a specific tile (e.g. while sweeping an offline-download
 * area), not just its corner. */
export function tileCenterLngLat(x: number, y: number, zoom: number): { lng: number; lat: number } {
  const nw = tileToLngLat(x, y, zoom)
  const se = tileToLngLat(x + 1, y + 1, zoom)
  return { lng: (nw.lng + se.lng) / 2, lat: (nw.lat + se.lat) / 2 }
}

/** Every tile x/y covering `bounds` at `zoom`, as a flat list. */
export function tilesForRange(range: TileRange): TileXY[] {
  const tiles: TileXY[] = []
  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      tiles.push({ x, y })
    }
  }
  return tiles
}
