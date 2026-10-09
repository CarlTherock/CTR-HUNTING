/**
 * Experimental visual aid: highlights image zones whose COLOUR resembles
 * blood (red, and optionally dark/rust tones). It is a plain colour rule in
 * HSV space — no learned model, no network, nothing leaves the device.
 *
 * What it can NOT do (and the UI says so): tell blood from leaves, berries,
 * soil, rust, paint or any other red/brown object; detect old, dry or diluted
 * blood reliably; work in very low light or overexposure. A highlighted zone
 * is a « zone candidate », never a confirmed clue, and no probability or
 * confidence percentage is computed.
 */

/** Minimal image buffer (structurally compatible with `ImageData`). */
export interface PixelBuffer {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

/** Display colour of the highlight. It only changes how candidate pixels are
 * PAINTED: which pixels are candidates is decided by the colour rule alone
 * (`isCandidateColor`) and never depends on this choice. */
export type HighlightColor = 'yellow' | 'cyan' | 'blue' | 'red'

export const HIGHLIGHT_COLOR_OPTIONS: readonly {
  value: HighlightColor
  label: string
  /** CSS colour of the swatch in the settings. */
  swatch: string
}[] = [
  { value: 'yellow', label: 'Jaune', swatch: '#ffeb00' },
  { value: 'cyan', label: 'Cyan', swatch: '#00ebff' },
  { value: 'blue', label: 'Bleu', swatch: '#2e6bff' },
  { value: 'red', label: 'Rouge', swatch: '#ff2a2a' },
]

export function isHighlightColor(value: unknown): value is HighlightColor {
  return HIGHLIGHT_COLOR_OPTIONS.some((option) => option.value === value)
}

export interface HighlightSettings {
  /** 0 (strict, few zones) … 100 (permissive, more zones and more false ones). */
  sensitivity: number
  /** Also flag dark/rust-brown tones (more false positives: soil, bark). */
  rustTones: boolean
  /** 0 (background untouched) … 1 (background greyed and dimmed). */
  backgroundAttenuation: number
  highlightColor: HighlightColor
}

export const DEFAULT_HIGHLIGHT_SETTINGS: HighlightSettings = {
  sensitivity: 50,
  rustTones: false,
  backgroundAttenuation: 0.5,
  highlightColor: 'yellow',
}

export const HIGHLIGHT_RGB: Record<
  HighlightSettings['highlightColor'],
  [number, number, number]
> = {
  yellow: [255, 235, 0],
  cyan: [0, 235, 255],
  blue: [46, 107, 255],
  red: [255, 42, 42],
}

/** Compact mention that stays visible over the camera at all times. */
export const CAMERA_WARNING_SHORT = 'Aide visuelle — sang non confirmé'

/** Full text, shown by « Aide / Infos » (and in the capture review). */
export const CAMERA_WARNING =
  'Aide visuelle : les zones surlignées ne sont pas du sang confirmé. Des feuilles, baies, sols et objets peuvent être surlignés. L’absence de surbrillance ne prouve pas l’absence de sang.'

/** Detail list of the same caution, one point per line. */
export const CAMERA_HELP_POINTS: readonly string[] = [
  'Faux positifs possibles : feuilles, baies, sol, écorce, rouille, peinture ou tout objet rouge ou brun peuvent être surlignés.',
  'Surbrillance ≠ sang confirmé : une zone surlignée est seulement « candidate », à vérifier sur place.',
  'Absence de surbrillance ≠ absence de sang : sang ancien, sec, dilué, lumière faible ou surexposition peuvent ne rien surligner.',
  'Aucune probabilité n’est calculée. Aucune zone n’est enregistrée toute seule : seul un indice que vous confirmez est enregistré.',
  'Le traitement se fait sur l’appareil ; aucune image n’est envoyée.',
]

interface Thresholds {
  minSaturation: number
  minValue: number
  /** Hue tolerance around pure red, in degrees (each side). */
  hueTolerance: number
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Sensitivity -> thresholds. Higher sensitivity widens the hue window and
 * lowers the saturation / brightness floors. */
export function thresholdsFor(sensitivity: number): Thresholds {
  const t = clamp01(sensitivity / 100)
  return {
    minSaturation: 0.65 - 0.4 * t, // 0.65 -> 0.25
    minValue: 0.35 - 0.2 * t, // 0.35 -> 0.15
    hueTolerance: 12 + 14 * t, // 12° -> 26°
  }
}

/** RGB (0–255) -> HSV with h in degrees [0,360), s and v in [0,1]. */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : delta / max, max]
}

/** True when one pixel's colour falls in the candidate range. */
export function isCandidateColor(
  r: number,
  g: number,
  b: number,
  settings: Pick<HighlightSettings, 'sensitivity' | 'rustTones'>,
): boolean {
  const [h, s, v] = rgbToHsv(r, g, b)
  const th = thresholdsFor(settings.sensitivity)
  const nearRed = h <= th.hueTolerance || h >= 360 - th.hueTolerance
  if (nearRed && s >= th.minSaturation && v >= th.minValue) return true
  if (settings.rustTones) {
    // Dark red-brown / rust: warmer hue, moderate saturation, dim.
    const rustHue = h > th.hueTolerance && h <= 32
    if (rustHue && s >= 0.4 && v >= 0.12 && v <= 0.6) return true
  }
  return false
}

export interface CandidateMask {
  width: number
  height: number
  /** 1 = candidate pixel. */
  mask: Uint8Array
  candidatePixels: number
}

export function computeCandidateMask(
  image: PixelBuffer,
  settings: Pick<HighlightSettings, 'sensitivity' | 'rustTones'>,
): CandidateMask {
  const { width, height, data } = image
  const mask = new Uint8Array(width * height)
  let candidatePixels = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (isCandidateColor(data[i], data[i + 1], data[i + 2], settings)) {
      mask[p] = 1
      candidatePixels++
    }
  }
  return { width, height, mask, candidatePixels }
}

/**
 * Builds the highlighted copy of an image. The input buffer is NEVER
 * modified: the original frame stays intact. Background pixels are greyed and
 * dimmed by `backgroundAttenuation`; candidate pixels are painted with the
 * chosen highlight colour.
 */
export function renderHighlight(
  image: PixelBuffer,
  candidates: CandidateMask,
  settings: Pick<HighlightSettings, 'backgroundAttenuation' | 'highlightColor'>,
  out?: Uint8ClampedArray<ArrayBuffer>,
): Uint8ClampedArray<ArrayBuffer> {
  const { data } = image
  const result =
    out && out.length === data.length ? out : new Uint8ClampedArray(data.length)
  const attenuation = clamp01(settings.backgroundAttenuation)
  const [hr, hg, hb] = HIGHLIGHT_RGB[settings.highlightColor]
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (candidates.mask[p] === 1) {
      // Blend toward the highlight colour so texture stays slightly visible.
      result[i] = hr * 0.8 + r * 0.2
      result[i + 1] = hg * 0.8 + g * 0.2
      result[i + 2] = hb * 0.8 + b * 0.2
    } else {
      const grey = 0.299 * r + 0.587 * g + 0.114 * b
      const dim = 1 - 0.5 * attenuation
      result[i] = (r + (grey - r) * attenuation) * dim
      result[i + 1] = (g + (grey - g) * attenuation) * dim
      result[i + 2] = (b + (grey - b) * attenuation) * dim
    }
    result[i + 3] = 255
  }
  return result
}

export interface Candidates {
  /** Share of the image flagged as candidate (0–1): a measured pixel ratio,
   * NOT a probability that it is blood. */
  areaRatio: number
  /** Whether the flagged pixels form at least one compact cluster (a
   * 8×8-grid cell mostly flagged), which filters out scattered noise. */
  hasCluster: boolean
}

const GRID = 8
const CLUSTER_CELL_RATIO = 0.4
/** Below this share of the image, nothing is reported as a candidate zone. */
export const MIN_AREA_RATIO = 0.003

export function analyzeCandidates(candidates: CandidateMask): Candidates {
  const { width, height, mask, candidatePixels } = candidates
  const total = width * height
  const areaRatio = total === 0 ? 0 : candidatePixels / total
  if (areaRatio === 0) return { areaRatio: 0, hasCluster: false }
  const cellW = Math.max(1, Math.floor(width / GRID))
  const cellH = Math.max(1, Math.floor(height / GRID))
  let hasCluster = false
  for (let gy = 0; gy < GRID && !hasCluster; gy++) {
    for (let gx = 0; gx < GRID && !hasCluster; gx++) {
      let flagged = 0
      let count = 0
      const y1 = Math.min(height, (gy + 1) * cellH)
      const x1 = Math.min(width, (gx + 1) * cellW)
      for (let y = gy * cellH; y < y1; y++) {
        for (let x = gx * cellW; x < x1; x++) {
          count++
          if (mask[y * width + x] === 1) flagged++
        }
      }
      if (count > 0 && flagged / count >= CLUSTER_CELL_RATIO) hasCluster = true
    }
  }
  return { areaRatio, hasCluster }
}

/** A frame is reported as containing a « zone candidate » only when enough of
 * it is flagged AND the flagged pixels are clustered. */
export function hasCandidateZone(result: Candidates): boolean {
  return result.areaRatio >= MIN_AREA_RATIO && result.hasCluster
}

export type LightingIssue = 'low-light' | 'overexposed' | null

export const LIGHTING_MESSAGE: Record<Exclude<LightingIssue, null>, string> = {
  'low-light':
    'Lumière faible : les couleurs sont peu fiables, le surlignage peut manquer des zones ou en inventer.',
  overexposed:
    'Surexposition : les zones très claires effacent les couleurs, le surlignage peut manquer des zones.',
}

/** Rough lighting check from mean brightness and clipped highlights. */
export function assessLighting(image: PixelBuffer): LightingIssue {
  const { data } = image
  const pixels = data.length / 4
  if (pixels === 0) return null
  let sum = 0
  let clipped = 0
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += luma
    if (data[i] > 250 && data[i + 1] > 250 && data[i + 2] > 250) clipped++
  }
  const mean = sum / pixels
  if (mean < 45) return 'low-light'
  if (mean > 215 || clipped / pixels > 0.25) return 'overexposed'
  return null
}

/** Size at which a frame is analysed: small and capped, so a phone is not
 * overloaded. The full-resolution original is only used when capturing. */
export const ANALYSIS_MAX_WIDTH = 320

export function analysisSize(
  videoWidth: number,
  videoHeight: number,
  maxWidth = ANALYSIS_MAX_WIDTH,
): { width: number; height: number } {
  if (videoWidth <= 0 || videoHeight <= 0) return { width: 0, height: 0 }
  const scale = Math.min(1, maxWidth / videoWidth)
  return {
    width: Math.max(1, Math.round(videoWidth * scale)),
    height: Math.max(1, Math.round(videoHeight * scale)),
  }
}

/** Minimum time between two alerts, so a sustained detection does not buzz. */
export const ALERT_MIN_INTERVAL_MS = 3000

export function shouldAlert(
  nowMs: number,
  lastAlertMs: number | null,
  minIntervalMs = ALERT_MIN_INTERVAL_MS,
): boolean {
  return lastAlertMs === null || nowMs - lastAlertMs >= minIntervalMs
}
