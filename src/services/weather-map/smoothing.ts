/**
 * Visual smoothing of a weather tile (RGBA, 8 bits). GeoMet draws the radar as
 * a 1 km grid with a 14-colour palette, so each cell shows up as a sharp block
 * once the map is zoomed in. Blurring the image by about one cell blends the
 * neighbouring cells instead — purely visual: no value is created or changed
 * (the reading at the map centre still comes from GetFeatureInfo).
 *
 * Colours are blurred premultiplied by alpha, so the soft edge of a rain
 * area fades out transparently instead of turning dark. Pixels outside the
 * tile repeat the edge pixel, so two neighbouring tiles do not leave a seam.
 */
export function smoothRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  passes = 2,
): Uint8ClampedArray<ArrayBuffer> {
  if (width <= 0 || height <= 0 || radius <= 0 || passes <= 0) {
    return new Uint8ClampedArray(rgba) as Uint8ClampedArray<ArrayBuffer>
  }
  const count = width * height
  // Premultiplied, as floats: no rounding drift between passes.
  const current = new Float32Array(count * 4)
  for (let p = 0; p < count; p++) {
    const alpha = rgba[p * 4 + 3] / 255
    current[p * 4] = rgba[p * 4] * alpha
    current[p * 4 + 1] = rgba[p * 4 + 1] * alpha
    current[p * 4 + 2] = rgba[p * 4 + 2] * alpha
    current[p * 4 + 3] = rgba[p * 4 + 3]
  }
  const scratch = new Float32Array(count * 4)

  const window = radius * 2 + 1
  /** One box-blur pass along a line: `length` pixels, `step` floats apart. */
  const blurLine = (
    source: Float32Array,
    target: Float32Array,
    start: number,
    length: number,
    step: number,
  ) => {
    for (let channel = 0; channel < 4; channel++) {
      const at = (i: number) =>
        source[start + Math.min(length - 1, Math.max(0, i)) * step + channel]
      let sum = 0
      for (let i = -radius; i <= radius; i++) sum += at(i)
      for (let i = 0; i < length; i++) {
        target[start + i * step + channel] = sum / window
        sum += at(i + radius + 1) - at(i - radius)
      }
    }
  }

  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) blurLine(current, scratch, y * width * 4, width, 4)
    for (let x = 0; x < width; x++) blurLine(scratch, current, x * 4, height, width * 4)
  }

  const out = new Uint8ClampedArray(new ArrayBuffer(count * 4))
  for (let p = 0; p < count; p++) {
    const alpha = current[p * 4 + 3]
    const scale = alpha > 0 ? 255 / alpha : 0
    out[p * 4] = current[p * 4] * scale
    out[p * 4 + 1] = current[p * 4 + 1] * scale
    out[p * 4 + 2] = current[p * 4 + 2] * scale
    out[p * 4 + 3] = alpha
  }
  return out
}
