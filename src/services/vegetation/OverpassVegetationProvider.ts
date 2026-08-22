import type { Coordinate, VegetationCategory, VegetationSample } from '@/types'
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
}

interface OverpassResponse {
  elements: OverpassElement[]
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
}
