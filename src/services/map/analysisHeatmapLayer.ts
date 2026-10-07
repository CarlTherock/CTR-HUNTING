import type { Map as MapLibreMap } from 'maplibre-gl'
import type { AnalysisHeatmapCell } from '@/types'
import { analysisHeatmapColor } from '@/utils/analysisHeatmapColors'

/** `rgba(r, g, b, a)` → numeric channels (alpha scaled to 0-255). */
export function parseRgba(color: string): [number, number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(color)
  if (!m) return [0, 0, 0, 0]
  const [r, g, b, a = '1'] = m[1].split(',').map((v) => v.trim())
  return [Number(r), Number(g), Number(b), Math.round(Number(a) * 255)]
}

/** Opacité d'une cellule bien renseignée / partiellement renseignée. */
const FULL_ALPHA = 0.5
const PARTIAL_ALPHA = 0.28

/** Ce que la couche doit dessiner pour une cellule :
 * - `scored`  : une couleur (indice de repère) ;
 * - `partial` : une couleur plus transparente + hachures (donnée manquante) ;
 * - `nodata`  : AUCUN score — motif gris, jamais la couleur « peu favorable » ;
 * - `none`    : pas de cellule à cet endroit de la grille. */
export type CellKind = 'scored' | 'partial' | 'nodata' | 'none'

export interface HeatmapGrid {
  lngs: number[]
  lats: number[] // north → south
  /** Offscreen canvas, one pixel per real cell (transparent = no score). */
  image: HTMLCanvasElement
  /** RGBA de `image` (même contenu), pour dessiner sans relire le canvas. */
  pixels: Uint8ClampedArray
  /** Nature de chaque cellule, même indexation que `pixels` (y * largeur + x). */
  kinds: CellKind[]
  /** Cellule ouverte dans la fiche, si elle est dans la grille. */
  selected: { x: number; y: number } | null
  cellLng: number
  cellLat: number
}

/** Rebuilds the regular grid the cells came from (`utils/grid.ts`'s
 * `buildGrid` — evenly spaced lat/lng) as a tiny image, one pixel per
 * real cell. Each cell is then drawn as its own visible block (no
 * smoothing between cells: blending would suggest a finer resolution than
 * the data has). */
export function buildHeatmapGrid(allCells: AnalysisHeatmapCell[]): HeatmapGrid | null {
  // A cell with a NaN/infinite coordinate can't be placed on the grid — and
  // left in, it would add a bogus row/column (NaN never matches in
  // `indexOf`, and poisons the sort and the cell-size math), blanking the
  // whole heatmap. Skip just that cell.
  const cells = allCells.filter(
    (c) => Number.isFinite(c.coordinate.lng) && Number.isFinite(c.coordinate.lat),
  )
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  const lngs = [...new Set(cells.map((c) => round(c.coordinate.lng)))].sort(
    (a, b) => a - b,
  )
  const lats = [...new Set(cells.map((c) => round(c.coordinate.lat)))].sort(
    (a, b) => b - a,
  )
  if (lngs.length === 0 || lats.length === 0) return null
  const image = document.createElement('canvas')
  image.width = lngs.length
  image.height = lats.length
  const ctx = image.getContext('2d')
  if (!ctx) return null
  const data = ctx.createImageData(lngs.length, lats.length)
  const kinds: CellKind[] = new Array<CellKind>(lngs.length * lats.length).fill('none')
  let selected: HeatmapGrid['selected'] = null
  for (const cell of cells) {
    const x = lngs.indexOf(round(cell.coordinate.lng))
    const y = lats.indexOf(round(cell.coordinate.lat))
    if (x < 0 || y < 0) continue
    const i = y * lngs.length + x
    if (cell.selected) selected = { x, y }
    if (cell.combined.overallScore === null) {
      kinds[i] = 'nodata'
      continue
    }
    kinds[i] = cell.partial ? 'partial' : 'scored'
    const [r, g, b, a] = parseRgba(
      analysisHeatmapColor(
        cell.combined.overallScore,
        cell.partial ? PARTIAL_ALPHA : FULL_ALPHA,
      ),
    )
    data.data[i * 4] = r
    data.data[i * 4 + 1] = g
    data.data[i * 4 + 2] = b
    data.data[i * 4 + 3] = a
  }
  ctx.putImageData(data, 0, 0)
  const cellLng =
    lngs.length > 1 ? (lngs[lngs.length - 1] - lngs[0]) / (lngs.length - 1) : 0.01
  const cellLat =
    lats.length > 1 ? (lats[0] - lats[lats.length - 1]) / (lats.length - 1) : 0.01
  return { lngs, lats, image, pixels: data.data, kinds, selected, cellLng, cellLat }
}

/** Petit motif en tuile, dessiné une fois : hachures diagonales
 * (`partial`) ou points gris (`nodata`). */
function makePattern(
  ctx: CanvasRenderingContext2D,
  kind: 'partial' | 'nodata',
): CanvasPattern | null {
  const tile = document.createElement('canvas')
  tile.width = 10
  tile.height = 10
  const t = tile.getContext('2d')
  if (!t) return null
  if (kind === 'partial') {
    t.strokeStyle = 'rgba(20, 20, 20, 0.55)'
    t.lineWidth = 1.5
    t.beginPath()
    t.moveTo(-1, 11)
    t.lineTo(11, -1)
    t.moveTo(-1, 1)
    t.lineTo(1, -1)
    t.moveTo(9, 11)
    t.lineTo(11, 9)
    t.stroke()
  } else {
    t.fillStyle = 'rgba(240, 240, 240, 0.55)'
    t.beginPath()
    t.arc(3, 3, 1.1, 0, Math.PI * 2)
    t.arc(8, 8, 1.1, 0, Math.PI * 2)
    t.fill()
  }
  return ctx.createPattern(tile, 'repeat')
}

/**
 * Owns a separate `<canvas>` (independent of `createWindLayer`'s) drawing
 * the analysis heatmap as one visible block per real cell — blocky on
 * purpose, so the true resolution of the data is what the eye sees. Redrawn
 * only when the camera moves (`render` event), never in a continuous
 * animation loop, so an idle map costs no battery.
 */
export function createAnalysisHeatmapLayer(map: MapLibreMap, container: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  container.appendChild(canvas)

  let grid: HeatmapGrid | null = null
  let listening = false
  let patterns: { partial: CanvasPattern | null; nodata: CanvasPattern | null } | null =
    null

  function draw() {
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      patterns = null
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!grid) return
    if (!patterns) {
      patterns = {
        partial: makePattern(ctx, 'partial'),
        nodata: makePattern(ctx, 'nodata'),
      }
    }

    const { lngs, lats, pixels, kinds, selected, cellLng, cellLat } = grid

    function quad(c2: CanvasRenderingContext2D, x: number, y: number) {
      const w = lngs[x] - cellLng / 2
      const e = lngs[x] + cellLng / 2
      const n = lats[y] + cellLat / 2
      const s = lats[y] - cellLat / 2
      const corners = [
        map.project([w, n]),
        map.project([e, n]),
        map.project([e, s]),
        map.project([w, s]),
      ]
      c2.beginPath()
      c2.moveTo(corners[0].x, corners[0].y)
      for (const c of corners.slice(1)) c2.lineTo(c.x, c.y)
      c2.closePath()
    }

    for (let y = 0; y < lats.length; y++) {
      for (let x = 0; x < lngs.length; x++) {
        const i = y * lngs.length + x
        const kind = kinds[i]
        if (kind === 'none') continue
        quad(ctx, x, y)
        if (kind === 'nodata') {
          // Aucune donnée ≠ « peu favorable » : ni couleur de score, un
          // fond gris léger, des points et un contour pointillé.
          ctx.fillStyle = 'rgba(120, 120, 120, 0.18)'
          ctx.fill()
          if (patterns.nodata) {
            ctx.fillStyle = patterns.nodata
            ctx.fill()
          }
          ctx.setLineDash([4, 3])
          ctx.strokeStyle = 'rgba(230, 230, 230, 0.55)'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.setLineDash([])
          continue
        }
        ctx.fillStyle = `rgba(${pixels[i * 4]}, ${pixels[i * 4 + 1]}, ${pixels[i * 4 + 2]}, ${pixels[i * 4 + 3] / 255})`
        ctx.fill()
        if (kind === 'partial' && patterns.partial) {
          ctx.fillStyle = patterns.partial
          ctx.fill()
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
        ctx.lineWidth = 0.75
        ctx.stroke()
      }
    }

    if (selected) {
      quad(ctx, selected.x, selected.y)
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.stroke()
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
      ctx.stroke()
    }
  }

  return {
    setCells(newCells: AnalysisHeatmapCell[] | null) {
      grid = newCells && newCells.length > 0 ? buildHeatmapGrid(newCells) : null
      if (grid && !listening) {
        map.on('render', draw)
        map.on('resize', draw)
        listening = true
      } else if (!grid && listening) {
        map.off('render', draw)
        map.off('resize', draw)
        listening = false
      }
      draw()
    },
    destroy() {
      map.off('render', draw)
      map.off('resize', draw)
      canvas.remove()
    },
  }
}
