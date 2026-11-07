import type { Coordinate } from '@/types'
import type {
  AnalysisExtent,
  LandClass,
  LandCoverData,
  LandPolygon,
} from '@/features/deer-intel/spatial/types'
import { extentBounds } from '@/features/deer-intel/spatial/extent'

/**
 * Service utilisé (le seul autorisé par la politique de sécurité et le registre de
 * confidentialité). Ajouter un miroir enverrait les coordonnées à un tiers de plus : décision
 * à valider avant tout ajout.
 */
export const ENDPOINTS = ['https://overpass-api.de/api/interpreter'] as const

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

const samePoint = (a: Coordinate, b: Coordinate) => a.lat === b.lat && a.lng === b.lng

/**
 * Assemble les segments d'un anneau extérieur. Dans OpenStreetMap, les grandes forêts et plans
 * d'eau (relations « multipolygon ») ont presque toujours leur contour coupé en plusieurs
 * chemins : chacun est ouvert et seul leur assemblage bout à bout forme un anneau fermé.
 * Les segments qui ne se ferment pas (données incomplètes) sont comptés, jamais complétés.
 */
export function stitchRings(segments: Coordinate[][]): {
  rings: Coordinate[][]
  unclosed: number
} {
  const pool = segments.filter((g) => g.length >= 2).map((g) => [...g])
  const rings: Coordinate[][] = []
  let unclosed = 0
  while (pool.length > 0) {
    let ring = pool.shift() as Coordinate[]
    let grew = true
    while (grew && !samePoint(ring[0], ring[ring.length - 1])) {
      grew = false
      const tail = ring[ring.length - 1]
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i]
        if (samePoint(seg[0], tail)) ring = [...ring, ...seg.slice(1)]
        else if (samePoint(seg[seg.length - 1], tail))
          ring = [...ring, ...[...seg].reverse().slice(1)]
        else continue
        pool.splice(i, 1)
        grew = true
        break
      }
    }
    if (samePoint(ring[0], ring[ring.length - 1]) && ring.length >= 4) rings.push(ring)
    else unclosed++
  }
  return { rings, unclosed }
}

/** Transforme la réponse Overpass `out geom` en polygones (trous ignorés). */
export function parseOverpassLandCover(json: unknown): LandPolygon[] {
  return parseWithStats(json).polygons
}

export function parseWithStats(json: unknown): {
  polygons: LandPolygon[]
  unclosedRings: number
} {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements ?? []
  const out: LandPolygon[] = []
  let unclosedRings = 0
  for (const el of elements) {
    const landClass = classifyTags(el.tags)
    if (!landClass) continue
    if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
      const ring = toRing(el.geometry)
      if (samePoint(ring[0], ring[ring.length - 1]))
        out.push({ id: `w${el.id}`, landClass, rings: [ring] })
    } else if (el.type === 'relation' && el.members) {
      const outers = el.members
        .filter((m) => m.role === 'outer' && m.geometry && m.geometry.length >= 2)
        .map((m) => toRing(m.geometry as OverpassGeomPoint[]))
      const { rings, unclosed } = stitchRings(outers)
      unclosedRings += unclosed
      rings.forEach((ring, i) =>
        out.push({ id: `r${el.id}-${i}`, landClass, rings: [ring] }),
      )
    }
  }
  return { polygons: out, unclosedRings }
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

/** Échec détaillé : service, adresse, code et cause — jamais un simple « indisponible ». */
export class LandCoverError extends Error {
  readonly attempts: string[]
  constructor(attempts: string[]) {
    super(`Occupation du sol (OpenStreetMap/Overpass) : ${attempts.join(' ; ')}`)
    this.name = 'LandCoverError'
    this.attempts = attempts
  }
}

const hostOf = (url: string) => new URL(url).host

/** Géométries d'occupation du sol (OpenStreetMap via Overpass) sur l'étendue demandée. Jamais de donnée inventée : une erreur est propagée avec sa cause. */
export class OverpassLandCoverProvider implements LandCoverProvider {
  private readonly endpoints: readonly string[]
  constructor(endpoints: readonly string[] = ENDPOINTS) {
    this.endpoints = endpoints
  }

  async fetchLandCover(
    extent: AnalysisExtent,
    signal?: AbortSignal,
  ): Promise<LandCoverData> {
    const attempts: string[] = []
    for (const endpoint of this.endpoints) {
      const host = hostOf(endpoint)
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: new URLSearchParams({ data: buildQuery(extent) }),
          signal,
        })
        if (!response.ok) {
          attempts.push(`${host} a répondu HTTP ${response.status}`)
          continue
        }
        const json: unknown = await response.json()
        // Overpass répond 200 même quand la requête a expiré ou manqué de mémoire : le résultat
        // est alors incomplet et ne doit pas passer pour « aucune occupation du sol ».
        const remark = (json as { remark?: unknown } | null)?.remark
        if (typeof remark === 'string' && /error|timed out|out of memory/i.test(remark)) {
          attempts.push(`${host} : réponse incomplète (${remark.slice(0, 120)})`)
          continue
        }
        const { polygons, unclosedRings } = parseWithStats(json)
        return {
          polygons,
          source: `OpenStreetMap (Overpass, ${host})`,
          fetchedAt: new Date().toISOString(),
          ...(unclosedRings > 0
            ? {
                warnings: [
                  `${unclosedRings} contour(s) incomplet(s) dans OpenStreetMap ignoré(s), non reconstitués.`,
                ],
              }
            : {}),
        }
      } catch (error) {
        if (signal?.aborted) throw error
        const detail =
          error instanceof Error ? `${error.name}: ${error.message}` : 'erreur'
        attempts.push(`${host} injoignable (${detail})`)
      }
    }
    throw new LandCoverError(attempts)
  }
}

export const landCoverProvider: LandCoverProvider = new OverpassLandCoverProvider()
