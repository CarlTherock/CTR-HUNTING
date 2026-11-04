import { describe, expect, it } from 'vitest'
import { smoothRgba } from './smoothing'

function image(width: number, height: number, pixel: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4)
  }
  return data
}
const at = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4))

describe('smoothRgba', () => {
  it('keeps the size and leaves a uniform image unchanged', () => {
    const src = image(8, 6, () => [40, 160, 70, 255])
    const out = smoothRgba(src, 8, 6, 2)
    expect(out).toHaveLength(src.length)
    expect(at(out, 8, 4, 3)).toEqual([40, 160, 70, 255])
    expect(at(out, 8, 0, 0)).toEqual([40, 160, 70, 255])
  })

  it('blends a sharp edge between two colours into a gradient', () => {
    const src = image(12, 1, (x) => (x < 6 ? [0, 255, 0, 255] : [0, 0, 255, 255]))
    const out = smoothRgba(src, 12, 1, 1, 1)
    const edgeLeft = at(out, 12, 5, 0)
    const edgeRight = at(out, 12, 6, 0)
    // Neither side is pure any more, and green decreases while blue increases.
    expect(edgeLeft[1]).toBeLessThan(255)
    expect(edgeLeft[2]).toBeGreaterThan(0)
    expect(edgeRight[1]).toBeGreaterThan(0)
    expect(edgeRight[2]).toBeLessThan(255)
    // Far from the edge the colours stay pure.
    expect(at(out, 12, 0, 0)).toEqual([0, 255, 0, 255])
    expect(at(out, 12, 11, 0)).toEqual([0, 0, 255, 255])
  })

  it('fades a transparent border without darkening the colour', () => {
    const src = image(9, 1, (x) => (x < 4 ? [0, 200, 0, 255] : [0, 0, 0, 0]))
    const out = smoothRgba(src, 9, 1, 2, 1)
    const [r, g, b, a] = at(out, 9, 4, 0)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(255)
    // Still the same green: premultiplied blur does not mix in black.
    expect([r, b]).toEqual([0, 0])
    expect(g).toBeGreaterThanOrEqual(198)
    expect(g).toBeLessThanOrEqual(200)
  })

  it('repeats edge pixels so a tile border keeps its colour (no seam)', () => {
    const src = image(10, 10, () => [200, 30, 30, 255])
    const out = smoothRgba(src, 10, 10, 3)
    expect(at(out, 10, 0, 0)).toEqual([200, 30, 30, 255])
    expect(at(out, 10, 9, 9)).toEqual([200, 30, 30, 255])
  })

  it('does nothing for a zero radius or an empty image', () => {
    const src = image(4, 4, (x, y) => [x * 20, y * 20, 0, 255])
    expect(Array.from(smoothRgba(src, 4, 4, 0))).toEqual(Array.from(src))
    expect(smoothRgba(new Uint8ClampedArray(0), 0, 0, 2)).toHaveLength(0)
  })
})
