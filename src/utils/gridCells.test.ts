import { describe, expect, it } from 'vitest'
import {
  buildGrid,
  cellBoundsAt,
  cellIndexAt,
  cellSizeMeters,
  formatCellMeters,
} from './grid'

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

describe('cellSizeMeters : la résolution réelle dépend de l’emprise', () => {
  it('une zone de 0,2° × 0,2° à 46,8° N donne des cellules d’environ 2 × 2,8 km (8 × 8)', () => {
    const size = cellSizeMeters(BOUNDS, 8)
    expect(size.heightMeters).toBeGreaterThan(2700)
    expect(size.heightMeters).toBeLessThan(2850)
    expect(size.widthMeters).toBeGreaterThan(1800)
    expect(size.widthMeters).toBeLessThan(2100)
  })

  it('zoomer (emprise 10× plus petite) divise la taille des cellules par 10', () => {
    const zoomed = {
      west: -71.21,
      east: -71.19,
      south: 46.79,
      north: 46.81,
    }
    expect(cellSizeMeters(zoomed, 8).heightMeters).toBeCloseTo(
      cellSizeMeters(BOUNDS, 8).heightMeters / 10,
      0,
    )
  })
})

describe('cellIndexAt / cellBoundsAt', () => {
  it('le centre de chaque cellule retombe dans sa propre cellule', () => {
    const points = buildGrid(BOUNDS, 8)
    points.forEach((p, i) => expect(cellIndexAt(BOUNDS, 8, p)).toBe(i))
  })

  it('hors de la zone analysée : null', () => {
    expect(cellIndexAt(BOUNDS, 8, { lat: 47, lng: -71.2 })).toBeNull()
    expect(cellIndexAt(BOUNDS, 8, { lat: 46.8, lng: -70 })).toBeNull()
  })

  it('le bord nord-est appartient à la dernière cellule (pas hors grille)', () => {
    expect(cellIndexAt(BOUNDS, 8, { lat: 46.9, lng: -71.1 })).toBe(63)
  })

  it('les bornes d’une cellule contiennent son centre et pavent la zone', () => {
    const points = buildGrid(BOUNDS, 8)
    const first = cellBoundsAt(BOUNDS, 8, 0)
    expect(first.south).toBeCloseTo(BOUNDS.south)
    expect(first.west).toBeCloseTo(BOUNDS.west)
    const last = cellBoundsAt(BOUNDS, 8, 63)
    expect(last.north).toBeCloseTo(BOUNDS.north)
    expect(last.east).toBeCloseTo(BOUNDS.east)
    const b = cellBoundsAt(BOUNDS, 8, 27)
    expect(points[27].lat).toBeGreaterThan(b.south)
    expect(points[27].lat).toBeLessThan(b.north)
    expect(points[27].lng).toBeGreaterThan(b.west)
    expect(points[27].lng).toBeLessThan(b.east)
  })
})

describe('formatCellMeters', () => {
  it('affiche des mètres sous 1 km, des kilomètres à virgule française au-delà', () => {
    expect(formatCellMeters(850)).toBe('850 m')
    expect(formatCellMeters(1940)).toBe('1,9 km')
  })
})
