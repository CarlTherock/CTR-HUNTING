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

export interface HeatmapGrid {
  lngs: number[]
  lats: number[] // north → south
  /** Offscreen canvas, one pixel per real cell (transparent = no score). */
  image: HTMLCanvasElement
  cellLng: number
  cellLat: number
}

/** Rebuilds the regular grid the cells came from (`utils/grid.ts`'s
 * `buildGrid` — evenly spaced lat/lng) as a tiny image, one pixel per
 * real cell. Upscaled with bilinear smoothing when drawn, which blends
 * *between* real cell centers for a continuous surface — each pixel
 * center still sits exactly on its real cell's value. */
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
  for (const cell of cells) {
    if (cell.combined.overallScore === null) continue
    const x = lngs.indexOf(round(cell.coordinate.lng))
    const y = lats.indexOf(round(cell.coordinate.lat))
    if (x < 0 || y < 0) continue
    const [r, g, b, a] = parseRgba(analysisHeatmapColor(cell.combined.overallScore, 0.5))
    const i = (y * lngs.length + x) * 4
    data.data[i] = r
    data.data[i + 1] = g
    data.data[i + 2] = b
    data.data[i + 3] = a
  }
  ctx.putImageData(data, 0, 0)
  const cellLng =
    lngs.length > 1 ? (lngs[lngs.length - 1] - lngs[0]) / (lngs.length - 1) : 0.01
  const cellLat =
    lats.length > 1 ? (lats[0] - lats[lats.length - 1]) / (lats.length - 1) : 0.01
  return { lngs, lats, image, cellLng, cellLat }
}

/**
 * Owns a separate `<canvas>` (independent of `createWindLayer`'s) drawing
 * the analysis heatmap as a continuous color surface over the analyzed
 * area — no more isolated radial blobs. Redrawn only when the camera
 * moves (`render` event), never in a continuous animation loop, so an
 * idle map costs no battery.
 */
export function createAnalysisHeatmapLayer(map: MapLibreMap, container: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  container.appendChild(canvas)

  let grid: HeatmapGrid | null = null
  let listening = false

  function draw() {
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!grid) return

    const { lngs, lats, image, cellLng, cellLat } = grid
    const west = lngs[0] - cellLng / 2
    const east = lngs[lngs.length - 1] + cellLng / 2
    const north = lats[0] + cellLat / 2
    const south = lats[lats.length - 1] - cellLat / 2

    const flat = Math.abs(map.getBearing()) < 0.5 && map.getPitch() < 1
    if (flat) {
      const topLeft = map.project([west, north])
      const bottomRight = map.project([east, south])
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(
        image,
        topLeft.x,
        topLeft.y,
        bottomRight.x - topLeft.x,
        bottomRight.y - topLeft.y,
      )
      return
    }
    // Rotated / tilted: one projected quad per real cell (no smoothing
    // across a non-affine projection — still the real values).
    const pixels = image
      .getContext('2d')
      ?.getImageData(0, 0, image.width, image.height).data
    if (!pixels) return
    for (let y = 0; y < lats.length; y++) {
      for (let x = 0; x < lngs.length; x++) {
        const i = (y * lngs.length + x) * 4
        if (pixels[i + 3] === 0) continue
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
        ctx.fillStyle = `rgba(${pixels[i]}, ${pixels[i + 1]}, ${pixels[i + 2]}, ${pixels[i + 3] / 255})`
        ctx.beginPath()
        ctx.moveTo(corners[0].x, corners[0].y)
        for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y)
        ctx.closePath()
        ctx.fill()
      }
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
