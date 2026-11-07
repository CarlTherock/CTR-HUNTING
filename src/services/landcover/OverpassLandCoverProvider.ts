import type { Coordinate } from '@/types'
import type {
  AnalysisExtent,
  LandClass,
  LandCoverData,
  LandPolygon,
} from '@/features/deer-intel/spatial/types'
import { extentBounds } from '@/features/deer-intel/spatial/extent'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'

export interface LandCoverProvider {
  fetchLandCover(extent: AnalysisExtent, signal?: AbortSignal): Promise<LandCoverData>
}

interface OverpassGeomPoint {
  lat: number
  lon: number
}
interface OverpassMember {
  type: string
  role?: string
  geometry?: OverpassGeomPoint[]
}
interface OverpassElement {
  type: 'way' | 'relation' | string
  id: number
  tags?: Record<string, string>
  geometry?: OverpassGeomPoint[]
  members?: OverpassMember[]
}

/** Classe d'occupation du sol d'après les étiquettes OSM, ou `null` si non pertinente. */
export function classifyTags(tags: Record<string, string> | undefined): LandClass | null {
  if (!tags) return null
  if (
    tags.natural === 'water' ||
    tags.waterway === 'riverbank' ||
    tags.landuse === 'reservoir'
  )
    return 'water'
  if (tags.natural === 'wetland') return 'wetland'
  if (
    tags.landuse === 'residential' ||
    tags.landuse === 'commercial' ||
    tags.landuse === 'industrial' ||
    tags.landuse === 'retail' ||
    tags.building !== undefined
  )
    return 'developed'
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'forest'
  if (
    tags.landuse === 'farmland' ||
    tags.landuse === 'meadow' ||
    tags.landuse === 'orchard' ||
    tags.landuse === 'vineyard'
  )
    return 'agricultural'
  if (
    tags.natural === 'grassland' ||
    tags.natural === 'scrub' ||
    tags.landuse === 'grass'
  )
    return 'open'
  return null
}

const toRing = (g: OverpassGeomPoint[]): Coordinate[] =>
  g.map((p) => ({ lat: p.lat, lng: p.lon }))

/** Transforme la réponse Overpass `out geom` en polygones. Les relations utilisent leurs anneaux « outer » fermés ; les trous sont ignorés. */
export function parseOverpassLandCover(json: unknown): LandPolygon[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements ?? []
  const out: LandPolygon[] = []
  for (const el of elements) {
    const landClass = classifyTags(el.tags)
    if (!landClass) continue
    if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
      const ring = toRing(el.geometry)
      const a = ring[0]
      const b = ring[ring.length - 1]
      if (a.lat === b.lat && a.lng === b.lng)
        out.push({ id: `w${el.id}`, landClass, rings: [ring] })
    } else if (el.type === 'relation' && el.members) {
      el.members
        .filter((m) => m.role === 'outer' && m.geometry && m.geometry.length >= 4)
        .forEach((m, i) => {
          const ring = toRing(m.geometry as OverpassGeomPoint[])
          const a = ring[0]
          const b = ring[ring.length - 1]
          if (a.lat === b.lat && a.lng === b.lng)
            out.push({ id: `r${el.id}-${i}`, landClass, rings: [ring] })
        })
    }
  }
  return out
}

export function buildQuery(extent: AnalysisExtent): string {
  const [s, w, n, e] = extentBounds(extent).map((v) => v.toFixed(6))
  const bbox = `${s},${w},${n},${e}`
  return `[out:json][timeout:25];(
  way["landuse"~"forest|farmland|meadow|orchard|vineyard|grass|residential|commercial|industrial|retail|reservoir"](${bbox});
  way["natural"~"wood|water|wetland|grassland|scrub"](${bbox});
  way["building"](${bbox});
  relation["landuse"~"forest|farmland|meadow"](${bbox});
  relation["natural"~"wood|water|wetland"](${bbox});
);out geom;`
}

/** Géométries d'occupation du sol (OpenStreetMap via Overpass) sur l'étendue demandée. Jamais de donnée inventée : une erreur réseau est propagée. */
export class OverpassLandCoverProvider implements LandCoverProvider {
  async fetchLandCover(
    extent: AnalysisExtent,
    signal?: AbortSignal,
  ): Promise<LandCoverData> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({ data: buildQuery(extent) }),
      signal,
    })
    if (!response.ok) throw new Error(`Overpass a répondu ${response.status}`)
    const json: unknown = await response.json()
    return {
      polygons: parseOverpassLandCover(json),
      source: 'OpenStreetMap (Overpass)',
      fetchedAt: new Date().toISOString(),
    }
  }
}

export const landCoverProvider: LandCoverProvider = new OverpassLandCoverProvider()
