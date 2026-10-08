import { describe, expect, it } from 'vitest'
import {
  ALERT_MIN_INTERVAL_MS,
  CAMERA_WARNING,
  DEFAULT_HIGHLIGHT_SETTINGS,
  HIGHLIGHT_RGB,
  analysisSize,
  analyzeCandidates,
  assessLighting,
  computeCandidateMask,
  hasCandidateZone,
  isCandidateColor,
  renderHighlight,
  rgbToHsv,
  shouldAlert,
  type PixelBuffer,
} from './bloodHighlight'

/* These images are SYNTHETIC. They validate the code paths of the colour rule
 * (which colours it flags, that the original is untouched, thresholds…). They
 * say nothing about a detection rate on real photos of blood, leaves or soil. */

type Rgb = [number, number, number]

function image(width: number, height: number, background: Rgb): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = background[0]
    data[i + 1] = background[1]
    data[i + 2] = background[2]
    data[i + 3] = 255
  }
  return { width, height, data }
}

function paint(img: PixelBuffer, x0: number, y0: number, w: number, h: number, c: Rgb) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.width + x) * 4
      img.data[i] = c[0]
      img.data[i + 1] = c[1]
      img.data[i + 2] = c[2]
    }
  }
}

const FOREST: Rgb = [70, 90, 60]
const DEFAULT = DEFAULT_HIGHLIGHT_SETTINGS

describe('colour rule', () => {
  it('converts RGB to HSV', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual([0, 1, 1])
    const [h, s, v] = rgbToHsv(0, 255, 0)
    expect([h, s, v]).toEqual([120, 1, 1])
  })

  it('flags bright and dark red', () => {
    expect(isCandidateColor(200, 20, 20, DEFAULT)).toBe(true)
    expect(isCandidateColor(110, 15, 15, DEFAULT)).toBe(true)
  })

  it('does not flag green foliage or a neutral grey', () => {
    expect(isCandidateColor(40, 140, 50, DEFAULT)).toBe(false)
    expect(isCandidateColor(128, 128, 128, DEFAULT)).toBe(false)
  })

  it('flags brown/rust only when rust tones are enabled', () => {
    expect(isCandidateColor(120, 70, 30, DEFAULT)).toBe(false)
    expect(isCandidateColor(120, 70, 30, { ...DEFAULT, rustTones: true })).toBe(true)
  })

  it('honestly flags look-alikes: a red autumn leaf and a dark berry are highlighted too', () => {
    // Documented limitation, not a bug: the rule is colour-only.
    expect(isCandidateColor(180, 40, 30, DEFAULT)).toBe(true)
    expect(isCandidateColor(150, 20, 50, DEFAULT)).toBe(true)
  })

  it('soil: not flagged by default, flagged (false positive) with rust tones', () => {
    expect(isCandidateColor(90, 60, 40, DEFAULT)).toBe(false)
    expect(isCandidateColor(90, 60, 40, { ...DEFAULT, rustTones: true })).toBe(true)
  })

  it('sensitivity widens what is flagged', () => {
    const pinkish: Rgb = [180, 110, 100]
    expect(isCandidateColor(...pinkish, { ...DEFAULT, sensitivity: 50 })).toBe(false)
    expect(isCandidateColor(...pinkish, { ...DEFAULT, sensitivity: 100 })).toBe(true)
    expect(isCandidateColor(...pinkish, { ...DEFAULT, sensitivity: 0 })).toBe(false)
  })
})

describe('zones, area and clustering', () => {
  it('reports a red patch on a forest background as a candidate zone', () => {
    const img = image(64, 64, FOREST)
    paint(img, 20, 20, 16, 16, [190, 25, 25])
    const result = analyzeCandidates(computeCandidateMask(img, DEFAULT))
    expect(result.areaRatio).toBeCloseTo(256 / 4096, 3)
    expect(hasCandidateZone(result)).toBe(true)
  })

  it('ignores scattered single pixels (noise) and tiny areas', () => {
    const img = image(64, 64, FOREST)
    for (let i = 0; i < 40; i++)
      paint(img, (i * 7) % 64, (i * 13) % 64, 1, 1, [190, 25, 25])
    const result = analyzeCandidates(computeCandidateMask(img, DEFAULT))
    expect(hasCandidateZone(result)).toBe(false)
  })

  it('reports nothing on a plain green scene, and the absence proves nothing (documented)', () => {
    const img = image(64, 64, FOREST)
    const result = analyzeCandidates(computeCandidateMask(img, DEFAULT))
    expect(result).toEqual({ areaRatio: 0, hasCluster: false })
    expect(CAMERA_WARNING).toMatch(
      /L’absence de surbrillance ne prouve pas l’absence de sang/,
    )
  })

  it('exposes a pixel ratio only: no probability or confidence', () => {
    const img = image(32, 32, FOREST)
    const result = analyzeCandidates(computeCandidateMask(img, DEFAULT))
    expect(Object.keys(result).sort()).toEqual(['areaRatio', 'hasCluster'])
  })
})

describe('rendering', () => {
  it('never modifies the original image', () => {
    const img = image(32, 32, FOREST)
    paint(img, 4, 4, 8, 8, [190, 25, 25])
    const before = Uint8ClampedArray.from(img.data)
    const mask = computeCandidateMask(img, DEFAULT)
    renderHighlight(img, mask, DEFAULT)
    expect(Array.from(img.data)).toEqual(Array.from(before))
  })

  it('paints candidates with the chosen highlight colour (yellow or cyan)', () => {
    const img = image(16, 16, FOREST)
    paint(img, 0, 0, 16, 16, [190, 25, 25])
    const mask = computeCandidateMask(img, DEFAULT)
    const yellow = renderHighlight(img, mask, { ...DEFAULT, highlightColor: 'yellow' })
    const cyan = renderHighlight(img, mask, { ...DEFAULT, highlightColor: 'cyan' })
    expect(yellow[0]).toBeGreaterThan(200)
    expect(yellow[2]).toBeLessThan(80)
    expect(cyan[0]).toBeLessThan(80)
    expect(cyan[2]).toBeGreaterThan(200)
    expect(HIGHLIGHT_RGB.yellow).not.toEqual(HIGHLIGHT_RGB.cyan)
  })

  it('attenuates the background only, and not at 0', () => {
    const img = image(16, 16, FOREST)
    const mask = computeCandidateMask(img, DEFAULT)
    const none = renderHighlight(img, mask, { ...DEFAULT, backgroundAttenuation: 0 })
    const strong = renderHighlight(img, mask, { ...DEFAULT, backgroundAttenuation: 1 })
    expect(Array.from(none.slice(0, 3))).toEqual(FOREST)
    expect(strong[0]).toBeLessThan(FOREST[0])
    // Greyed: channels converge.
    expect(Math.abs(strong[0] - strong[1])).toBeLessThan(Math.abs(FOREST[0] - FOREST[1]))
  })

  it('reuses an output buffer of the right size (no per-frame allocation)', () => {
    const img = image(8, 8, FOREST)
    const out = new Uint8ClampedArray(img.data.length)
    const mask = computeCandidateMask(img, DEFAULT)
    expect(renderHighlight(img, mask, DEFAULT, out)).toBe(out)
  })
})

describe('lighting', () => {
  it('warns in low light and in overexposure, and stays quiet otherwise', () => {
    expect(assessLighting(image(16, 16, [10, 12, 10]))).toBe('low-light')
    expect(assessLighting(image(16, 16, [250, 250, 250]))).toBe('overexposed')
    expect(assessLighting(image(16, 16, FOREST))).toBeNull()
  })
})

describe('performance helpers', () => {
  it('analyses at a capped resolution', () => {
    expect(analysisSize(1920, 1080)).toEqual({ width: 320, height: 180 })
    expect(analysisSize(200, 100)).toEqual({ width: 200, height: 100 })
    expect(analysisSize(0, 0)).toEqual({ width: 0, height: 0 })
  })

  it('throttles alerts', () => {
    expect(shouldAlert(1000, null)).toBe(true)
    expect(shouldAlert(1000 + ALERT_MIN_INTERVAL_MS - 1, 1000)).toBe(false)
    expect(shouldAlert(1000 + ALERT_MIN_INTERVAL_MS, 1000)).toBe(true)
  })
})
