import { haversineMeters } from '@/utils/geo'
import { buildGrid } from '@/utils/grid'
import type { Coordinate, VegetationCategory, VegetationSample } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import type { VegetationProvider } from './VegetationProvider'

// Verified live against the real Overpass API (overpass-api.de) before
// writing this: GET/POST with an Overpass QL query string in `data=`,
// `nwr(around:R,LAT,LON)[...]` matches nodes/ways/relations tagged
// within R meters of a point (tags live on ways/relations too, not just
// nodes — querying `node` alone silently misses most real-world
// landuse/natural polygons), `out:json` returns real JSON, and the
// public instance sends `Access-Control-Allow-Origin: *` so this is
// callable directly from the browser, no proxy needed.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const TIMEOUT_SECONDS = 15

interface OverpassElement {
  tags?: Record<string, string>
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
}

interface OverpassResponse {
  elements: OverpassElement[]
}

/** A node's own lat/lon, or a way/relation's synthetic `center` (only
 * present when the query uses `out center;`, as `fetchVegetationGrid`
 * does) — `null` for a query mode that omitted geometry entirely (the
 * single-point `fetchVegetation` query uses `out tags;`, which has no
 * coordinates and doesn't need any, since it's already anchored to one
 * known point). */
function elementCoordinate(element: OverpassElement): Coordinate | null {
  if (element.center) return { lat: element.center.lat, lng: element.center.lon }
  if (element.lat !== undefined && element.lon !== undefined) return { lat: element.lat, lng: element.lon }
  return null
}

/** Maps a real OSM element's tags to one hunting-relevant bucket — every
 * mapping below is a publicly documented OSM wiki tag value
 * (wiki.openstreetmap.org/wiki/Landuse, /wiki/Key:natural), not invented.
 * Returns `null` for tag combinations this app doesn't have a bucket for
 * (e.g. `landuse=religious`) rather than forcing a wrong guess. */
function categorize(tags: Record<string, string>): VegetationCategory | null {
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'forest'
  if (tags.natural === 'wetland' || tags.landuse === 'wetland') return 'wetland'
  if (['farmland', 'meadow', 'orchard', 'vineyard', 'allotments'].includes(tags.landuse ?? '')) {
    return 'agricultural'
  }
  if (tags.natural === 'grassland' || tags.landuse === 'grass' || tags.leisure === 'park') {
    return 'grassland'
  }
  if (tags.natural === 'water' || tags.landuse === 'reservoir' || tags.natural === 'bay') return 'water'
  if (['residential', 'commercial', 'industrial', 'retail', 'construction'].includes(tags.landuse ?? '')) {
    return 'developed'
  }
  if (tags.landuse || tags.natural || tags.leisure) return 'other'
  return null
}

function buildQuery(coordinate: Coordinate, radiusMeters: number): string {
  const around = `around:${radiusMeters},${coordinate.lat},${coordinate.lng}`
  return `[out:json][timeout:${TIMEOUT_SECONDS}];(nwr(${around})["landuse"];nwr(${around})["natural"];nwr(${around})["leisure"="park"];);out tags;`
}

/** Bounding-box variant: one query for the *whole* area (never one
 * request per grid point), with `out center;` so ways/relations carry a
 * synthetic center coordinate (nodes already have their own lat/lon) —
 * `fetchVegetationGrid` needs real positions to assign each tagged
 * element to its nearest grid cell. */
function buildBboxQuery(bounds: LngLatBounds): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`
  return `[out:json][timeout:${TIMEOUT_SECONDS}];(nwr(${bbox})["landuse"];nwr(${bbox})["natural"];nwr(${bbox})["leisure"="park"];);out center;`
}

export class OverpassVegetationProvider implements VegetationProvider {
  async fetchVegetation(coordinate: Coordinate, radiusMeters: number): Promise<VegetationSample | null> {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: new URLSearchParams({ data: buildQuery(coordinate, radiusMeters) }),
    })
    if (!response.ok) {
      throw new Error(`Vegetation lookup failed (${response.status})`)
    }
    const data = (await response.json()) as OverpassResponse
    if (!data.elements || data.elements.length === 0) return null

    const categoryCounts: Partial<Record<VegetationCategory, number>> = {}
    for (const element of data.elements) {
      const category = categorize(element.tags ?? {})
      if (category) categoryCounts[category] = (categoryCounts[category] ?? 0) + 1
    }
    if (Object.keys(categoryCounts).length === 0) return null

    return { coordinate, radiusMeters, categoryCounts, source: 'openstreetmap' }
  }

  async fetchVegetationGrid(bounds: LngLatBounds, gridSize: number): Promise<VegetationSample[]> {
    const points = buildGrid(bounds, gridSize)
    // Half the average cell spacing — a reasonable "belongs to this
    // cell" radius derived from the actual grid, not an arbitrary number.
    const cellSpacingMeters = haversineMeters(
      { lat: bounds.south, lng: bounds.west },
      { lat: bounds.north, lng: bounds.east },
    ) / gridSize / Math.SQRT2
    const radiusMeters = cellSpacingMeters / 2

    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: new URLSearchParams({ data: buildBboxQuery(bounds) }),
    })
    if (!response.ok) {
      throw new Error(`Vegetation lookup failed (${response.status})`)
    }
    const data = (await response.json()) as OverpassResponse

    const samples: VegetationSample[] = points.map((coordinate) => ({
      coordinate,
      radiusMeters,
      categoryCounts: {},
      source: 'openstreetmap',
    }))

    for (const element of data.elements ?? []) {
      const elementCoord = elementCoordinate(element)
      const category = element.tags ? categorize(element.tags) : null
      if (!elementCoord || !category) continue

      let nearestIndex = 0
      let nearestDistance = haversineMeters(elementCoord, points[0])
      for (let i = 1; i < points.length; i++) {
        const distance = haversineMeters(elementCoord, points[i])
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestIndex = i
        }
      }
      const counts = samples[nearestIndex].categoryCounts
      counts[category] = (counts[category] ?? 0) + 1
    }

    return samples
  }
}
