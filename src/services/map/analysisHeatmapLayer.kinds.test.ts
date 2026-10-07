import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisHeatmapCell } from '@/types'
import { buildHeatmapGrid } from './analysisHeatmapLayer'

function cell(
  lat: number,
  lng: number,
  overallScore: number | null,
  extra: Partial<AnalysisHeatmapCell> = {},
): AnalysisHeatmapCell {
  return { coordinate: { lat, lng }, combined: { overallScore, results: [] }, ...extra }
}

/** jsdom n'a pas de canvas : un contexte 2D minimal. */
function stubCanvas() {
  const ctx = {
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: () => undefined,
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
}

describe('buildHeatmapGrid : sans donnée ≠ peu favorable ≠ partiel', () => {
  afterEach(() => vi.restoreAllMocks())

  it('distingue cellule bien renseignée, partielle, sans donnée et peu favorable', () => {
    stubCanvas()
    const grid = buildHeatmapGrid([
      cell(0, 0, 80), // bien renseignée
      cell(0, 0.01, 80, { partial: true }), // partielle
      cell(0.01, 0, null), // aucune donnée
      cell(0.01, 0.01, 5), // vraiment peu favorable
    ])
    // Rangée du haut = nord (lat 0.01) : [sans donnée, peu favorable]
    // Rangée du bas  = sud  (lat 0)    : [renseignée, partielle]
    expect(grid?.kinds).toEqual(['nodata', 'scored', 'scored', 'partial'])
  })

  it('une cellule sans donnée reste transparente dans l’image : jamais la couleur « défavorable »', () => {
    stubCanvas()
    const grid = buildHeatmapGrid([cell(0, 0, null), cell(0, 0.01, 5)])
    const pixels = grid?.pixels
    expect(pixels?.[3]).toBe(0) // sans donnée
    expect(pixels?.[7]).toBeGreaterThan(0) // peu favorable : rouge, opaque à demi
    expect(pixels?.[4]).toBeGreaterThan(200) // composante rouge
  })

  it('une cellule partielle est plus transparente qu’une cellule bien renseignée de même score', () => {
    stubCanvas()
    const grid = buildHeatmapGrid([cell(0, 0, 70), cell(0, 0.01, 70, { partial: true })])
    const pixels = grid?.pixels
    expect(pixels?.[7]).toBeLessThan(pixels?.[3] ?? 0)
    expect(pixels?.[7]).toBeGreaterThan(0)
  })

  it('repère la cellule sélectionnée', () => {
    stubCanvas()
    const grid = buildHeatmapGrid([cell(0, 0, 70), cell(0, 0.01, 70, { selected: true })])
    expect(grid?.selected).toEqual({ x: 1, y: 0 })
  })
})
