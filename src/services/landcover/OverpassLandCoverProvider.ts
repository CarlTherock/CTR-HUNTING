import type { Coordinate } from '@/types'
import type { AnalysisExtent, LandClass, LandCoverData, LandPolygon } from '@/features/deer-intel/spatial/types'
import { extentBounds } from '@/features/deer-intel/spatial/extent'
import { pointInRing } from '@/features/deer-intel/spatial/geo'

/** Aucun nouveau destinataire de coordonnées n’est ajouté. */
export const ENDPOINTS = ['https://overpass-api.de/api/interpreter'] as const

export interface LandCoverProvider {
  fetchLandCover(extent: AnalysisExtent, signal?: AbortSignal): Promise<LandCoverData>
}

interface OverpassGeomPoint { lat: number; lon: number }
interface OverpassMember { type: string; role?: string; geometry?: OverpassGeomPoint[] }
interface OverpassElement {
  type: string
  id: number
  tags?: Record<string, string>
  geometry?: OverpassGeomPoint[]
  members?: OverpassMember[]
}

export function classifyTags(tags: Record<string, string> | undefined): LandClass | null {
  if (!tags) return null
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir') return 'water'
  if (tags.natural === 'wetland') return 'wetland'
  if (['residential', 'commercial', 'industrial', 'retail'].includes(tags.landuse) || tags.building !== undefined) return 'developed'
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'forest'
  if (['farmland', 'meadow', 'orchard', 'vineyard'].includes(tags.landuse)) return 'agricultural'
  if (tags.natural === 'grassland' || tags.natural === 'scrub' || tags.landuse === 'grass') return 'open'
  return null
}

const toRing = (g: OverpassGeomPoint[]): Coordinate[] => g.map((p) => ({ lat: p.lat, lng: p.lon }))
const samePoint = (a: Coordinate, b: Coordinate) => a.lat === b.lat && a.lng === b.lng

/** Assemble des segments sans fermer artificiellement les contours incomplets. */
export function stitchRings(segments: Coordinate[][]): { rings: Coordinate[][]; unclosed: number } {
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
        else if (samePoint(seg[seg.length - 1], tail)) ring = [...ring, ...[...seg].reverse().slice(1)]
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

function ringArea(ring: readonly Coordinate[]): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += a.lng * b.lat - b.lng * a.lat
  }
  return Math.abs(sum) / 2
}

export function parseOverpassLandCover(json: unknown): LandPolygon[] {
  return parseWithStats(json).polygons
}

/** Conserve [extérieur, ...trous] ; un trou incomplet ne devient jamais du couvert plein. */
export function parseWithStats(json: unknown): { polygons: LandPolygon[]; unclosedRings: number } {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements ?? []
  const out: LandPolygon[] = []
  let unclosedRings = 0
  for (const el of elements) {
    const landClass = classifyTags(el.tags)
    if (!landClass) continue
    if (el.type === 'way' && el.geometry && el.geometry.length >= 4) {
      const ring = toRing(el.geometry)
      if (samePoint(ring[0], ring[ring.length - 1])) out.push({ id: `w${el.id}`, landClass, rings: [ring] })
    } else if (el.type === 'relation' && el.members) {
      const segments = (role: string) => el.members!
        .filter((m) => m.role === role && m.geometry && m.geometry.length >= 2)
        .map((m) => toRing(m.geometry as OverpassGeomPoint[]))
      const outer = stitchRings(segments('outer'))
      const inner = stitchRings(segments('inner'))
      unclosedRings += outer.unclosed + inner.unclosed
      const missingInner = el.members.some((m) => m.role === 'inner' && (!m.geometry || m.geometry.length < 2))
      if (missingInner) unclosedRings++
      if (inner.unclosed > 0 || missingInner) continue
      const polygons = outer.rings.map((ring, i): LandPolygon => ({ id: `r${el.id}-${i}`, landClass, rings: [ring] }))
      let orphan = false
      for (const hole of inner.rings) {
        const owners = polygons.filter((p) => pointInRing(hole[0], p.rings[0]))
          .sort((a, b) => ringArea(a.rings[0]) - ringArea(b.rings[0]))
        if (!owners.length) { unclosedRings++; orphan = true; break }
        owners[0].rings.push(hole)
      }
      if (!orphan) out.push(...polygons)
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

export class LandCoverError extends Error {
  readonly attempts: string[]
  constructor(attempts: string[]) {
    super(`Occupation du sol (OpenStreetMap/Overpass) : ${attempts.join(' ; ')}`)
    this.name = 'LandCoverError'
    this.attempts = attempts
  }
}

const TRANSIENT = new Set([429, 500, 502, 503, 504])
export const RETRY_DELAYS_MS = [2000, 5000] as const
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
  const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')) }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
  signal?.addEventListener('abort', abort, { once: true })
})

export class OverpassLandCoverProvider implements LandCoverProvider {
  private readonly endpoints: readonly string[]
  private readonly delays: readonly number[]
  constructor(endpoints: readonly string[] = ENDPOINTS, delays: readonly number[] = RETRY_DELAYS_MS) {
    this.endpoints = endpoints
    this.delays = delays
  }

  async fetchLandCover(extent: AnalysisExtent, signal?: AbortSignal): Promise<LandCoverData> {
    const attempts: string[] = []
    for (const endpoint of this.endpoints) {
      const host = new URL(endpoint).host
      for (let attempt = 0; attempt <= this.delays.length; attempt++) {
        if (attempt > 0) await wait(this.delays[attempt - 1], signal)
        const tag = attempt > 0 ? ` (essai ${attempt + 1})` : ''
        let transient: boolean
        try {
          const response = await fetch(endpoint, { method: 'POST', body: new URLSearchParams({ data: buildQuery(extent) }), signal })
          if (!response.ok) {
            attempts.push(`${host} a répondu HTTP ${response.status}${tag}`)
            transient = TRANSIENT.has(response.status)
          } else {
            const json: unknown = await response.json()
            const remark = (json as { remark?: unknown } | null)?.remark
            if (typeof remark === 'string' && /error|timed out|out of memory/i.test(remark)) {
              attempts.push(`${host} : réponse incomplète (${remark.slice(0, 120)})${tag}`)
              transient = true
            } else {
              const { polygons, unclosedRings } = parseWithStats(json)
              return {
                polygons,
                source: `OpenStreetMap (Overpass, ${host})`,
                fetchedAt: new Date().toISOString(),
                ...(unclosedRings > 0 ? { warnings: [`${unclosedRings} contour(s) incomplet(s) ou trou(s) non rattachable(s) ignoré(s) ; les relations à trous incomplets sont écartées, jamais remplies.`] } : {}),
              }
            }
          }
        } catch (error) {
          if (signal?.aborted) throw error
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'erreur'
          attempts.push(`${host} injoignable (${detail})${tag}`)
          transient = true
        }
        if (!transient) break
      }
    }
    throw new LandCoverError(attempts)
  }
}

export const landCoverProvider: LandCoverProvider = new OverpassLandCoverProvider()
