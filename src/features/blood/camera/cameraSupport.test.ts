import { beforeEach, describe, expect, it } from 'vitest'
import {
  CAMERA_PREFS_KEY,
  DEFAULT_CAMERA_PREFS,
  loadPrefs,
  sanitizePrefs,
  savePrefs,
} from './cameraPrefs'
import {
  coverTransform,
  displayToSource,
  sourceToDisplay,
  visibleShare,
} from './coverMapping'

describe('camera preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts on the filtered single view with the defaults', () => {
    expect(loadPrefs()).toEqual(DEFAULT_CAMERA_PREFS)
    expect(DEFAULT_CAMERA_PREFS.mode).toBe('filtered')
  })

  it('keeps what was saved, for all four colours', () => {
    for (const highlightColor of ['yellow', 'cyan', 'blue', 'red'] as const) {
      const prefs = {
        ...DEFAULT_CAMERA_PREFS,
        highlight: {
          sensitivity: 70,
          backgroundAttenuation: 0.2,
          rustTones: true,
          highlightColor,
        },
        mode: 'split' as const,
        divider: 35,
        sound: true,
      }
      savePrefs(prefs)
      expect(loadPrefs()).toEqual(prefs)
    }
  })

  it('falls back field by field on damaged values and never throws', () => {
    expect(
      sanitizePrefs({
        highlight: { sensitivity: 900, highlightColor: 'green', rustTones: 'yes' },
        mode: 'cube',
        divider: -4,
        vibrate: 1,
      }),
    ).toEqual({
      ...DEFAULT_CAMERA_PREFS,
      highlight: { ...DEFAULT_CAMERA_PREFS.highlight, sensitivity: 100 },
      divider: 10,
    })
    window.localStorage.setItem(CAMERA_PREFS_KEY, '{not json')
    expect(loadPrefs()).toEqual(DEFAULT_CAMERA_PREFS)
    expect(sanitizePrefs(null)).toEqual(DEFAULT_CAMERA_PREFS)
  })
})

describe('object-fit: cover mapping', () => {
  it('crops the sides of a landscape source shown in a portrait box, without stretching', () => {
    const t = coverTransform(1280, 720, 390, 844)
    expect(t.scale).toBeCloseTo(844 / 720, 6)
    expect(t.offsetY).toBeCloseTo(0, 6)
    expect(t.offsetX).toBeLessThan(0)
    const share = visibleShare(1280, 720, 390, 844)
    expect(share.y).toBe(1)
    expect(share.x).toBeCloseTo(390 / 844 / (1280 / 720), 4)
  })

  it('crops top and bottom of a source that is narrower than the box', () => {
    const t = coverTransform(720, 1280, 844, 390)
    expect(t.scale).toBeCloseTo(844 / 720, 6)
    expect(t.offsetX).toBeCloseTo(0, 6)
    expect(t.offsetY).toBeLessThan(0)
  })

  it('maps a source pixel to the display and back (round trip)', () => {
    const t = coverTransform(1280, 720, 390, 844)
    for (const p of [
      { x: 640, y: 360 },
      { x: 700, y: 100 },
      { x: 560, y: 700 },
    ]) {
      const back = displayToSource(t, sourceToDisplay(t, p))
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    }
    // The centre of the source is the centre of the box.
    const centre = sourceToDisplay(t, { x: 640, y: 360 })
    expect(centre.x).toBeCloseTo(195, 6)
    expect(centre.y).toBeCloseTo(422, 6)
  })

  it('a source of the same ratio as the box is not cropped', () => {
    expect(visibleShare(1280, 720, 640, 360)).toEqual({ x: 1, y: 1 })
  })

  it('degenerate sizes return the identity instead of NaN', () => {
    expect(coverTransform(0, 0, 100, 100)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
  })
})
