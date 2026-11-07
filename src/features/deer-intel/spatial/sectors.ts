import type { Coordinate } from '@/types'
import { cellCorners } from './grid'
import { makeProjection } from './geo'
import type { AnalysisExtent, GridCell, Sector } from './types'

/** Seuil ABSOLU (même échelle partout) au-dessus duquel une cellule fait partie d'un secteur. */
export const SECTOR_THRESHOLD = 60
export const MIN_SECTOR_CELLS = 4

interface Edge {
  a: string
  b: string
  from: Coordinate
  to: Coordinate
}

const key = (c: Coordinate) => `${c.lat.toFixed(7)},${c.lng.toFixed(7)}`

function ringArea(ring: Coordinate[], proj: ReturnType<typeof makeProjection>): number {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const p = proj.toMeters(ring[i])
    const q = proj.toMeters(ring[(i + 1) % ring.length])
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

/** Contours d'un ensemble de cellules : arêtes extérieures chaînées en anneaux. */
function traceRings(
  extent: AnalysisExtent,
  cellSizeM: number,
  set: GridCell[],
): Coordinate[][] {
  const have = new Set(set.map((c) => `${c.ix},${c.iy}`))
  const edges: Edge[] = []
  const add = (from: Coordinate, to: Coordinate) =>
    edges.push({ a: key(from), b: key(to), from, to })
  for (const c of set) {
    const k = cellCorners(extent, cellSizeM, c.ix, c.iy)
    if (!have.has(`${c.ix},${c.iy - 1}`)) add(k.nw, k.ne)
    if (!have.has(`${c.ix + 1},${c.iy}`)) add(k.ne, k.se)
    if (!have.has(`${c.ix},${c.iy + 1}`)) add(k.se, k.sw)
    if (!have.has(`${c.ix - 1},${c.iy}`)) add(k.sw, k.nw)
  }
  const byStart = new Map<string, Edge[]>()
  for (const e of edges) byStart.set(e.a, [...(byStart.get(e.a) ?? []), e])
  const used = new Set<Edge>()
  const rings: Coordinate[][] = []
  for (const first of edges) {
    if (used.has(first)) continue
    const ring: Coordinate[] = [first.from]
    let cur = first
    used.add(cur)
    for (let guard = 0; guard < edges.length + 2; guard++) {
      ring.push(cur.to)
      if (cur.b === first.a) break
      const next = (byStart.get(cur.b) ?? []).find((e) => !used.has(e))
      if (!next) break
      used.add(next)
      cur = next
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

/** Secteurs = composantes connexes (4 voisins) de cellules au-dessus du seuil absolu. */
export function buildSectors(
  extent: AnalysisExtent,
  cellSizeM: number,
  cells: GridCell[],
  minCells = MIN_SECTOR_CELLS,
): Sector[] {
  const hot = cells.filter((c) => c.score !== null && c.score >= SECTOR_THRESHOLD)
  const at = new Map(hot.map((c) => [`${c.ix},${c.iy}`, c]))
  const seen = new Set<string>()
  const proj = makeProjection(extent.center)
  const sectors: Omit<Sector, 'id' | 'rank'>[] = []
  for (const start of hot) {
    const k0 = `${start.ix},${start.iy}`
    if (seen.has(k0)) continue
    const group: GridCell[] = []
    const stack = [start]
    seen.add(k0)
    while (stack.length) {
      const c = stack.pop() as GridCell
      group.push(c)
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nk = `${c.ix + dx},${c.iy + dy}`
        const o = at.get(nk)
        if (o && !seen.has(nk)) {
          seen.add(nk)
          stack.push(o)
        }
      }
    }
    if (group.length < minCells) continue
    const rings = traceRings(extent, cellSizeM, group)
    if (rings.length === 0) continue
    // Anneau extérieur = plus grande aire ; les autres sont des trous.
    rings.sort((r1, r2) => Math.abs(ringArea(r2, proj)) - Math.abs(ringArea(r1, proj)))
    const mean = group.reduce((s, c) => s + (c.score ?? 0), 0) / group.length
    sectors.push({
      rings,
      cellCount: group.length,
      areaHa: Math.round(((group.length * cellSizeM * cellSizeM) / 10_000) * 10) / 10,
      meanScore: Math.round(mean),
      centroid: {
        lat: group.reduce((s, c) => s + c.center.lat, 0) / group.length,
        lng: group.reduce((s, c) => s + c.center.lng, 0) / group.length,
      },
    })
  }
  return sectors
    .sort((a, b) => b.meanScore - a.meanScore || b.cellCount - a.cellCount)
    .map((s, i) => ({ ...s, id: `S${i + 1}`, rank: i + 1 }))
}
