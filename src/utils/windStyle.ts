/**
 * Presentation settings of the wind particle layer. Purely visual: nothing
 * here changes a wind value, the animation speed or the dispersion maths
 * (`utils/windField.ts`). « Size » is how long the trail behind each particle
 * is kept on screen, never how fast it moves.
 */
export type WindSize = 'normal' | 'large' | 'xlarge'
export type WindThickness = 'thin' | 'normal' | 'thick'
export type WindDensity = 'low' | 'normal' | 'high'

export interface WindStyle {
  size: WindSize
  thickness: WindThickness
  density: WindDensity
  /** Dark halo under every stroke and fully opaque colours. */
  contrast: boolean
}

export const DEFAULT_WIND_STYLE: WindStyle = {
  size: 'normal',
  thickness: 'normal',
  density: 'normal',
  contrast: false,
}

/** Fraction of the previous frame kept each frame: the closer to 1, the
 * longer the tail. `normal` is the historical value (0.9). */
export const TRAIL_KEEP: Record<WindSize, number> = {
  normal: 0.9,
  large: 0.945,
  xlarge: 0.965,
}

/** Stroke width in CSS pixels (scaled by the device pixel ratio when drawn). */
export const LINE_WIDTH: Record<WindThickness, number> = {
  thin: 1.2,
  normal: 1.8,
  thick: 3.2,
}

/** Particle count — independent of size and thickness. `normal` is the
 * historical value (400). */
export const PARTICLE_COUNT: Record<WindDensity, number> = {
  low: 220,
  normal: 400,
  high: 700,
}

/** Extra width of the halo stroke (CSS px) and its colour. */
export const HALO_EXTRA_WIDTH = 2.4
export const HALO_COLOR = 'rgba(0, 0, 0, 0.6)'

export const WIND_SIZE_LABEL: Record<WindSize, string> = {
  normal: 'Normal',
  large: 'Grand',
  xlarge: 'Très grand',
}
export const WIND_THICKNESS_LABEL: Record<WindThickness, string> = {
  thin: 'Fine',
  normal: 'Normale',
  thick: 'Épaisse',
}
export const WIND_DENSITY_LABEL: Record<WindDensity, string> = {
  low: 'Faible',
  normal: 'Normale',
  high: 'Élevée',
}

/** Frames needed for a trail to fade below ~8 % — the paused (still) image
 * is painted for that many frames so its tails are as long as when moving.
 * 24 for `normal`, the historical value. */
export function staticFrameCount(size: WindSize): number {
  return Math.ceil(Math.log(0.08) / Math.log(TRAIL_KEEP[size]))
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

/** Reads a stored value defensively: anything unknown falls back to the
 * default for that field (a corrupted or older record never breaks the map). */
export function parseWindStyle(raw: unknown): WindStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    size: pick(r.size, ['normal', 'large', 'xlarge'], DEFAULT_WIND_STYLE.size),
    thickness: pick(
      r.thickness,
      ['thin', 'normal', 'thick'],
      DEFAULT_WIND_STYLE.thickness,
    ),
    density: pick(r.density, ['low', 'normal', 'high'], DEFAULT_WIND_STYLE.density),
    contrast: typeof r.contrast === 'boolean' ? r.contrast : DEFAULT_WIND_STYLE.contrast,
  }
}
