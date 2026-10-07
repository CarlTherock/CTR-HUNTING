import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisHeatmapCell } from '@/types'
import { buildHeatmapGrid, parseRgba } from './analysisHeatmapLayer'

function cell(
  lat: number,
  lng: number,
  overallScore: number | null,
): AnalysisHeatmapCell {
  return { coordinate: { lat, lng }, combined: { overallScore, results: [] } }
}

/** jsdom has no canvas: a minimal 2D context that records putImageData. */
function stubCanvas() {
  const putCalls: { width: number; height: number; data: Uint8ClampedArray }[] = []
  const ctx = {
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }) => {
      putCalls.push(img)
    },
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  return putCalls
}

describe('parseRgba', () => {
  it('parses rgba() into channels with alpha scaled to 0-255', () => {
    expect(parseRgba('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30, 128])
    expect(parseRgba('rgb(1, 2, 3)')).toEqual([1, 2, 3, 255])
    expect(parseRgba('not a color')).toEqual([0, 0, 0, 0])
  })
})

describe('buildHeatmapGrid', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds one pixel per real cell on a regular grid, north to south', () => {
    const put = stubCanvas()
    const grid = buildHeatmapGrid([
      cell(0, 0, 70),
      cell(0, 0.01, 40),
      cell(0.01, 0, 20),
      cell(0.01, 0.01, null),
    ])
    expect(grid?.lngs).toEqual([0, 0.01])
    expect(grid?.lats).toEqual([0.01, 0])
    expect(grid?.image.width).toBe(2)
    expect(grid?.image.height).toBe(2)
    // The null-score cell stays transparent (never painted as a score).
    // Top row is the northern one (lat 0.01): [20, null].
    expect(put[0].data[3]).toBeGreaterThan(0)
    expect(put[0].data[7]).toBe(0)
  })

  it('ignores a cell with a NaN coordinate instead of corrupting the whole grid', () => {
    stubCanvas()
    const grid = buildHeatmapGrid([
      cell(0, 0, 70),
      cell(0, 0.01, 40),
      cell(0.01, 0, 20),
      cell(0.01, 0.01, 55),
      cell(Number.NaN, 0.02, 90),
      cell(0.02, Number.NaN, 90),
    ])
    expect(grid).not.toBeNull()
    expect(grid?.image.width).toBe(2)
    expect(grid?.image.height).toBe(2)
    expect(Number.isFinite(grid?.cellLng)).toBe(true)
    expect(Number.isFinite(grid?.cellLat)).toBe(true)
  })

  it('returns null when no cell has a usable coordinate', () => {
    stubCanvas()
    expect(buildHeatmapGrid([cell(Number.NaN, Number.NaN, 50)])).toBeNull()
    expect(buildHeatmapGrid([])).toBeNull()
  })
})
