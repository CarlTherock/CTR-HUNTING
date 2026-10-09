import type { ImpactEstimate, Observation, ShotRecord } from '@/types'
import type { AnatomyRegion, Illustration, Point, ViewBox } from './types'

export const MIN_SCALE = 1
export const MAX_SCALE = 4

export interface ZoomState {
  scale: number
  /** Centre of the visible box, in illustration units. */
  cx: number
  cy: number
}

export function initialZoom(ill: Illustration): ZoomState {
  return { scale: 1, cx: ill.width / 2, cy: ill.height / 2 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Part of the illustration currently shown. */
export function visibleBox(ill: Illustration, zoom: ZoomState): ViewBox {
  const w = ill.width / zoom.scale
  const h = ill.height / zoom.scale
  return {
    x: clamp(zoom.cx - w / 2, 0, ill.width - w),
    y: clamp(zoom.cy - h / 2, 0, ill.height - h),
    w,
    h,
  }
}

/** Keeps the scale in range and the visible box inside the drawing. */
export function normalizeZoom(ill: Illustration, zoom: ZoomState): ZoomState {
  const scale = clamp(zoom.scale, MIN_SCALE, MAX_SCALE)
  const box = visibleBox(ill, { ...zoom, scale })
  return { scale, cx: box.x + box.w / 2, cy: box.y + box.h / 2 }
}

/** Multiplies the zoom, keeping `anchor` (illustration units) under the same
 * screen position. Without an anchor, zooms about the centre. */
export function zoomBy(
  ill: Illustration,
  zoom: ZoomState,
  factor: number,
  anchor?: Point,
): ZoomState {
  const scale = clamp(zoom.scale * factor, MIN_SCALE, MAX_SCALE)
  if (!anchor) return normalizeZoom(ill, { ...zoom, scale })
  const before = visibleBox(ill, zoom)
  const fx = (anchor.x - before.x) / before.w
  const fy = (anchor.y - before.y) / before.h
  const w = ill.width / scale
  const h = ill.height / scale
  return normalizeZoom(ill, {
    scale,
    cx: anchor.x - fx * w + w / 2,
    cy: anchor.y - fy * h + h / 2,
  })
}

export function panBy(
  ill: Illustration,
  zoom: ZoomState,
  dx: number,
  dy: number,
): ZoomState {
  return normalizeZoom(ill, { ...zoom, cx: zoom.cx + dx, cy: zoom.cy + dy })
}

export interface ScreenRect {
  left: number
  top: number
  width: number
  height: number
}

/** The SVG draws `box` centred and uncropped inside its element
 * (`preserveAspectRatio` meet): pixels per illustration unit and the margin. */
export function screenMapping(
  rect: ScreenRect,
  box: ViewBox,
): { pixelsPerUnit: number; offsetX: number; offsetY: number } {
  const pixelsPerUnit = Math.min(rect.width / box.w, rect.height / box.h)
  return {
    pixelsPerUnit,
    offsetX: (rect.width - box.w * pixelsPerUnit) / 2,
    offsetY: (rect.height - box.h * pixelsPerUnit) / 2,
  }
}

/** Screen position → illustration units (not clamped). */
export function clientToUnits(rect: ScreenRect, box: ViewBox, client: Point): Point {
  const { pixelsPerUnit, offsetX, offsetY } = screenMapping(rect, box)
  return {
    x: box.x + (client.x - rect.left - offsetX) / pixelsPerUnit,
    y: box.y + (client.y - rect.top - offsetY) / pixelsPerUnit,
  }
}

/** Screen position → 0..1 position on the whole illustration, whatever the
 * zoom or the size of the element. Clamped to the drawing. */
export function clientToNormalized(
  rect: ScreenRect,
  box: ViewBox,
  ill: Illustration,
  client: Point,
): Point {
  const units = clientToUnits(rect, box, client)
  return {
    x: clamp(units.x / ill.width, 0, 1),
    y: clamp(units.y / ill.height, 0, 1),
  }
}

export function normalizedToUnits(ill: Illustration, point: Point): Point {
  return { x: point.x * ill.width, y: point.y * ill.height }
}

export function unitsToNormalized(ill: Illustration, point: Point): Point {
  return {
    x: clamp(point.x / ill.width, 0, 1),
    y: clamp(point.y / ill.height, 0, 1),
  }
}

export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (!a || !b) continue
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

/** The region of the drawing containing a normalized point, or null. */
export function regionAt(ill: Illustration, point: Point): AnatomyRegion | null {
  const units = normalizedToUnits(ill, point)
  return ill.regions.find((region) => pointInPolygon(units, region.polygon)) ?? null
}

export function regionById(
  ill: Illustration,
  id: string | undefined,
): AnatomyRegion | null {
  if (!id) return null
  return ill.regions.find((region) => region.id === id) ?? null
}

/** Normalized position of a region's anchor (what « choose from the list »
 * places). */
export function regionAnchor(ill: Illustration, region: AnatomyRegion): Point {
  return unitsToNormalized(ill, region.anchor)
}

export function buildImpact(
  ill: Illustration,
  point: Point,
  note: string,
  nowIso: string,
): ImpactEstimate {
  const region = regionAt(ill, point)
  const trimmed = note.trim()
  return {
    species: ill.species,
    view: ill.view,
    x: round4(point.x),
    y: round4(point.y),
    ...(region ? { regionId: region.id } : {}),
    presumed: true,
    recordedAt: nowIso,
    illustrationVersion: ill.version,
    ...(trimmed ? { note: trimmed.slice(0, 500) } : {}),
  }
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

export function withImpact(shot: ShotRecord, impact: ImpactEstimate): ShotRecord {
  return { ...shot, impact }
}

export function withoutImpact(shot: ShotRecord): ShotRecord {
  const copy: ShotRecord = { ...shot }
  delete copy.impact
  return copy
}

/** A point can only be saved on a shot of the same species. */
export function impactMatchesShot(shot: ShotRecord, ill: Illustration): boolean {
  return shot.species === ill.species
}

export type VersionStatus = 'current' | 'older'

/** A saved point keeps the drawing version it was placed on. If the drawing
 * has changed since, the point is shown but flagged, never silently moved. */
export function impactVersionStatus(
  impact: ImpactEstimate,
  ill: Illustration,
): VersionStatus {
  return impact.illustrationVersion === ill.version ? 'current' : 'older'
}

export function shotsWithImpact(observations: readonly Observation[]): Observation[] {
  return observations.filter((o) => o.shot?.impact !== undefined)
}

export function isNormalizedPoint(value: unknown): value is Point {
  if (typeof value !== 'object' || value === null) return false
  const { x, y } = value as Record<string, unknown>
  return (
    typeof x === 'number' && typeof y === 'number' && x >= 0 && x <= 1 && y >= 0 && y <= 1
  )
}
