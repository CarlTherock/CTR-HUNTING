import { inflateSync } from 'node:zlib'
import { Buffer } from 'node:buffer'

export interface DecodedPng {
  width: number
  height: number
  data: Uint8Array
}

/** PNG RGB/RGBA 8 bits, sans Canvas ni Image.decode dans la page testée. */
export function decodePng(input: Uint8Array): DecodedPng {
  const png = Buffer.from(input)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (png.length < 8 || !png.subarray(0, 8).equals(signature)) throw new Error('Invalid PNG signature')
  let width = 0, height = 0, channels = 0, ended = false
  const chunks: Buffer[] = []
  for (let offset = 8; offset + 12 <= png.length;) {
    const size = png.readUInt32BE(offset)
    if (size > png.length - offset - 12) throw new Error('Truncated PNG chunk')
    const kind = png.toString('ascii', offset + 4, offset + 8)
    const bytes = png.subarray(offset + 8, offset + 8 + size)
    if (kind === 'IHDR') {
      if (size !== 13 || width !== 0) throw new Error('Invalid PNG header')
      width = bytes.readUInt32BE(0); height = bytes.readUInt32BE(4)
      if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000) throw new Error('Invalid PNG dimensions')
      if (bytes[8] !== 8 || (bytes[9] !== 2 && bytes[9] !== 6) || bytes[10] !== 0 || bytes[11] !== 0 || bytes[12] !== 0) throw new Error('Unsupported PNG format: expected non-interlaced RGB/RGBA 8-bit')
      channels = bytes[9] === 2 ? 3 : 4
    } else if (kind === 'IDAT') chunks.push(bytes)
    else if (kind === 'IEND') { ended = true; break }
    offset += size + 12
  }
  if (!ended || !width || chunks.length === 0) throw new Error('Incomplete PNG')
  const stride = width * channels
  const expected = (stride + 1) * height
  const raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: expected })
  if (raw.length !== expected) throw new Error('Invalid PNG scanline length')
  const data = new Uint8Array(width * height * 4)
  let previous = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const offset = y * (stride + 1), filter = raw[offset]
    if (filter > 4) throw new Error('Unsupported PNG filter')
    const row = Uint8Array.from(raw.subarray(offset + 1, offset + 1 + stride))
    if (filter !== 0) for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0
      let predictor: number
      if (filter === 1) predictor = a
      else if (filter === 2) predictor = b
      else if (filter === 3) predictor = Math.floor((a + b) / 2)
      else {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      row[i] = (row[i] + predictor) & 255
    }
    if (channels === 4) data.set(row, y * width * 4)
    else for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      data[at] = row[x * 3]; data[at + 1] = row[x * 3 + 1]; data[at + 2] = row[x * 3 + 2]; data[at + 3] = 255
    }
    previous = row
  }
  return { width, height, data }
}

export function dominantPngColor(png: Uint8Array): readonly [number, number, number] {
  const { data } = decodePng(png)
  const buckets = new Map<number, number>()
  for (let i = 0; i < data.length; i += 4 * 7) {
    const key = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  let best = 0, count = -1
  for (const [key, n] of buckets) if (n > count) { best = key; count = n }
  return [((best >> 10) & 31) << 3, ((best >> 5) & 31) << 3, (best & 31) << 3]
}
