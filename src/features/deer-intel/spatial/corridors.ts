import type { Coordinate } from '@/types'
import type { GridCell, LandClass } from './types'

/** Connectivité potentielle : résistances heuristiques, pas une piste observée. */
export const CORRIDOR_RULE_IDS = ['COR-LEASTCOST-01', 'COR-CONTACT-01'] as const
export const CORRIDOR_LABEL = 'Corridor potentiel de connectivité — non piste observée'
export type ResistanceScenario = 'base' | 'couvert_prefere' | 'uniforme'
export type ResistanceTable = Record<LandClass | 'unknown', number | null>
export const RESISTANCE_SCENARIOS: Record<ResistanceScenario, ResistanceTable> = {
  base: { forest: 1, wetland: 3, agricultural: 2, open: 2, developed: 8, water: null, unknown: 5 },
  couvert_prefere: { forest: 1, wetland: 4, agricultural: 4, open: 4, developed: 12, water: null, unknown: 6 },
  uniforme: { forest: 1, wetland: 2, agricultural: 1.5, open: 1.5, developed: 4, water: null, unknown: 3 },
}
export const CORRIDOR_LIMITS: string[] = [
  'Résistances heuristiques (forêt 1, milieu ouvert/agricole 2, milieu humide 3, bâti 8, donnée absente 5) : choix de conception, non calibrés et non attribués à une étude.',
  'Seul l’obstacle connu (eau) est infranchissable ; routes, clôtures, relief, pente et pression de chasse ne sont pas modélisés. Une donnée absente n’est jamais traitée comme favorable.',
  'Aucune fréquentation, aucune heure de passage, aucun droit d’accès : un corridor animal n’est pas un accès pour le chasseur ni une trace enregistrée.',
  'Coût d’une arête = longueur × moyenne des résistances des deux cellules (convention de calcul).',
]
export interface Corridor {
  id: string
  kind: 'principal' | 'alternative'
  fromCore: number
  toCore: number
  path: Coordinate[]
  lengthM: number
  cost: number
  robustness: 'robuste' | 'fragile' | 'non_evalue'
  overlapWithBase: number | null
}
export interface CorridorResult {
  computed: true
  label: string
  cores: { id: number; cellCount: number; areaHa: number; centroid: Coordinate }[]
  corridors: Corridor[]
  contactIndexMPerHa: number | null
  contactLengthM: number
  notes: string[]
}
export interface CorridorUnavailable {
  computed: false
  reason: string
}
export type CorridorOutcome = CorridorResult | CorridorUnavailable
export const CORE_SCORE_MIN = 60
export const MIN_CORE_CELLS = 3
export const MAX_CORES = 3
export const ALTERNATIVE_MAX_OVERLAP = 0.6
export const ROBUST_MIN_OVERLAP = 0.6

interface Graph {
  width: number
  height: number
  index: Map<number, number>
  cells: GridCell[]
  cellSizeM: number
}
const key = (ix: number, iy: number, width: number) => iy * width + ix

/** Vérifier les coordonnées AVANT la clé linéaire : aucun bouclage entre lignes. */
function at(g: Graph, x: number, y: number): number | undefined {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= g.width || y < 0 || y >= g.height) return undefined
  return g.index.get(key(x, y, g.width))
}
function buildGraph(cells: GridCell[], width: number, height: number, cellSizeM: number): Graph {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0 || !Number.isFinite(cellSizeM) || cellSizeM <= 0) throw new RangeError('Dimensions de grille invalides')
  const index = new Map<number, number>()
  cells.forEach((c, i) => index.set(key(c.ix, c.iy, width), i))
  return { width, height, index, cells, cellSizeM }
}
function resistance(cell: GridCell, table: ResistanceTable): number | null {
  return table[cell.landClass ?? 'unknown']
}

/** Composantes connexes à quatre voisins, triées par taille. */
export function findCores(g: Graph): number[][] {
  const seen = new Set<number>(), cores: number[][] = []
  g.cells.forEach((c, i) => {
    if (seen.has(i) || c.score === null || c.score < CORE_SCORE_MIN) return
    const comp: number[] = [], stack = [i]
    seen.add(i)
    while (stack.length) {
      const cur = stack.pop() as number
      comp.push(cur)
      const cc = g.cells[cur] as GridCell
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const j = at(g, cc.ix + dx, cc.iy + dy)
        if (j === undefined || seen.has(j)) continue
        const n = g.cells[j] as GridCell
        if (n.score === null || n.score < CORE_SCORE_MIN) continue
        seen.add(j)
        stack.push(j)
      }
    }
    if (comp.length >= MIN_CORE_CELLS) cores.push(comp)
  })
  return cores.sort((a, b) => b.length - a.length || (a[0] as number) - (b[0] as number)).slice(0, MAX_CORES)
}
interface Route {
  cells: number[]
  cost: number
}
class MinHeap {
  private a: [number, number][] = []
  get size() { return this.a.length }
  push(cost: number, node: number) {
    const a = this.a
    a.push([cost, node])
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if ((a[p] as [number, number])[0] <= (a[i] as [number, number])[0]) break
      ;[a[p], a[i]] = [a[i] as [number, number], a[p] as [number, number]]
      i = p
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a, top = a[0], last = a.pop()
    if (a.length && last) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < a.length && (a[l] as [number, number])[0] < (a[m] as [number, number])[0]) m = l
        if (r < a.length && (a[r] as [number, number])[0] < (a[m] as [number, number])[0]) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i] as [number, number], a[m] as [number, number]]
        i = m
      }
    }
    return top
  }
}

/** Dijkstra à huit voisins ; aucun passage diagonal entre coins bloqués. */
export function leastCost(g: Graph, table: ResistanceTable, sources: number[], targets: Set<number>, extra?: Map<number, number>): Route | null {
  const n = g.cells.length
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1)
  const heap = new MinHeap()
  for (const s of sources) { dist[s] = 0; heap.push(0, s) }
  const res = (i: number) => {
    const r = resistance(g.cells[i] as GridCell, table)
    return r === null ? null : r * (extra?.get(i) ?? 1)
  }
  for (;;) {
    const top = heap.pop()
    if (!top) return null
    const [d, u] = top
    if (d > (dist[u] as number)) continue
    if (targets.has(u)) {
      const cells: number[] = []
      for (let c = u; c !== -1; c = prev[c] as number) cells.push(c)
      return { cells: cells.reverse(), cost: d }
    }
    const cu = g.cells[u] as GridCell, ru = res(u)
    if (ru === null) continue
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const v = at(g, cu.ix + dx, cu.iy + dy)
      if (v === undefined) continue
      const rv = res(v)
      if (rv === null) continue
      if (dx !== 0 && dy !== 0) {
        const a = at(g, cu.ix + dx, cu.iy), b = at(g, cu.ix, cu.iy + dy)
        if (a === undefined || b === undefined || res(a) === null || res(b) === null) continue
      }
      const len = (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) * g.cellSizeM
      const nd = d + len * ((ru + rv) / 2)
      if (nd < (dist[v] as number)) { dist[v] = nd; prev[v] = u; heap.push(nd, v) }
    }
  }
}
function overlap(base: number[], other: number[]): number {
  const a = new Set(base), inter = other.filter((c) => a.has(c)).length
  const union = new Set([...base, ...other]).size
  return union === 0 ? 0 : inter / union
}
function lengthOf(g: Graph, cells: number[]): number {
  let total = 0
  for (let i = 1; i < cells.length; i++) {
    const a = g.cells[cells[i - 1] as number] as GridCell, b = g.cells[cells[i] as number] as GridCell
    total += (a.ix !== b.ix && a.iy !== b.iy ? Math.SQRT2 : 1) * g.cellSizeM
  }
  return Math.round(total)
}
const isCover = (c: GridCell) => c.landClass === 'forest'
const isFood = (c: GridCell) => c.landClass === 'agricultural' || c.landClass === 'open'
export function contactIndex(g: Graph, extentAreaHa: number): { lengthM: number; indexMPerHa: number | null } {
  let edges = 0
  for (const c of g.cells) for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
    const j = at(g, c.ix + dx, c.iy + dy)
    if (j === undefined) continue
    const n = g.cells[j] as GridCell
    if ((isCover(c) && isFood(n)) || (isFood(c) && isCover(n))) edges++
  }
  const lengthM = edges * g.cellSizeM
  return { lengthM, indexMPerHa: extentAreaHa > 0 ? lengthM / extentAreaHa : null }
}
export function computeCorridors(input: { cells: GridCell[]; width: number; height: number; cellSizeM: number; radiusM: number }): CorridorOutcome {
  const { cells, width, height, cellSizeM, radiusM } = input
  const g = buildGraph(cells, width, height, cellSizeM)
  if (cells.filter((c) => c.landClass !== null).length === 0) return { computed: false, reason: 'Corridors non calculés : aucune géométrie d’occupation du sol dans l’emprise.' }
  const coreCells = findCores(g)
  const contact = contactIndex(g, Math.PI * radiusM * radiusM / 10_000)
  const notes: string[] = []
  const cores = coreCells.map((cs, id) => {
    const pts = cs.map((i) => (g.cells[i] as GridCell).center)
    return { id, cellCount: cs.length, areaHa: cs.length * cellSizeM * cellSizeM / 10_000, centroid: { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length } }
  })
  if (coreCells.length < 2) return { computed: true, label: CORRIDOR_LABEL, cores, corridors: [], contactIndexMPerHa: contact.indexMPerHa, contactLengthM: contact.lengthM, notes: ['Moins de deux noyaux d’habitat distincts dans l’emprise : aucun corridor à relier (aucun tracé inventé).'] }
  const corridors: Corridor[] = []
  for (let a = 0; a < coreCells.length; a++) for (let b = a + 1; b < coreCells.length; b++) {
    const src = coreCells[a] as number[], tgt = new Set(coreCells[b] as number[])
    const base = leastCost(g, RESISTANCE_SCENARIOS.base, src, tgt)
    if (!base) { notes.push(`Noyaux ${a + 1} et ${b + 1} : aucun chemin sans obstacle connu (eau).`); continue }
    const others = (['couvert_prefere', 'uniforme'] as const).map((s) => leastCost(g, RESISTANCE_SCENARIOS[s], src, tgt))
    const worst = Math.min(...others.map((r) => r ? overlap(base.cells, r.cells) : 0))
    const id = `C${a + 1}-${b + 1}`
    corridors.push({ id, kind: 'principal', fromCore: a, toCore: b, path: base.cells.map((i) => (g.cells[i] as GridCell).center), lengthM: lengthOf(g, base.cells), cost: Math.round(base.cost), robustness: worst >= ROBUST_MIN_OVERLAP ? 'robuste' : 'fragile', overlapWithBase: Math.round(worst * 100) / 100 })
    const extra = new Map<number, number>(), band = new Set<number>()
    for (const i of base.cells) {
      const c = g.cells[i] as GridCell
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const j = at(g, c.ix + dx, c.iy + dy)
        if (j !== undefined) band.add(j)
      }
    }
    for (const i of band) extra.set(i, 4)
    for (const i of src) extra.delete(i)
    for (const i of tgt) extra.delete(i)
    const alt = leastCost(g, RESISTANCE_SCENARIOS.base, src, tgt, extra)
    if (alt) {
      const ov = overlap(base.cells, alt.cells)
      if (ov <= ALTERNATIVE_MAX_OVERLAP) corridors.push({ id: `${id}-alt`, kind: 'alternative', fromCore: a, toCore: b, path: alt.cells.map((i) => (g.cells[i] as GridCell).center), lengthM: lengthOf(g, alt.cells), cost: Math.round(alt.cost), robustness: 'non_evalue', overlapWithBase: Math.round(ov * 100) / 100 })
    }
  }
  if (corridors.some((c) => c.robustness === 'fragile')) notes.push('Corridor « fragile » : le tracé change nettement selon les résistances heuristiques ; ne pas en tirer un passage précis.')
  return { computed: true, label: CORRIDOR_LABEL, cores, corridors, contactIndexMPerHa: contact.indexMPerHa, contactLengthM: contact.lengthM, notes }
}
