import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { decodePng, dominantPngColor } from '../../e2e/support/pngDecode'
import { solidPng } from '../../e2e/support/png'
import { colorsClose } from '../../e2e/support/pixels'

const fixtures = [
  [3, 0, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAIAAAAYMVE8AAAAl0lEQVR4nAGMAHP/AAArVh9KdT5plF2Is3yn0pvG8brlENkEL/gjTgATPmkyXYhRfKdwm8aPuuWu2QTN+CPsF0ILNmEAJlF8RXCbZI+6g67Zos34wewX4As2/ypVHkl0ADlkj1iDrneizZbB7LXgC9T/KvMeSRI9aDFchwBMd6JrlsGKteCp1P/I8x7nEj0GMVwlUHtEb5rQw0Ic+BKDWwAAAABJRU5ErkJggg=='],
  [3, 1, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAIAAAAYMVE8AAAAJElEQVR4nGNk0A6TxwEYhe0yccqpBdbglLNM6ccp51O+CJccACsHE00ooqjAAAAAAElFTkSuQmCC'],
  [3, 2, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAIAAAAYMVE8AAAAK0lEQVR4nGNi0A6T9yq1y5wS27G5Zvml2cc+7noqcJNF/4eyH5MwbkALOQDo+RSszFP5HQAAAABJRU5ErkJggg=='],
  [3, 3, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAIAAAAYMVE8AAAARElEQVR4nGNm0A6TN/XSd4myC8n0S66MLe7IbZpRM0m9R9GcWVjTThITzAQRzLJGHliEwRSzmk0gVk0gfQau0ViEwQAAiasXjRiOC+8AAAAASUVORK5CYII='],
  [3, 4, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAIAAAAYMVE8AAAAI0lEQVR4nGNh0A6TxwFYhLEAeQiFVQ4qiyknD6ew6ZOHygMAgjULyrJsklcAAAAASUVORK5CYII='],
  [4, 0, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAYAAACXU8ZrAAAApklEQVR4nGNg0A5rlPcqXWCXOWV/bMfmezXLL/2dfeyjzK6nAtY3WfSjfij7VTIIA2WNgLKBQNkCoGw/UHYdUPYsUPaNuFMut1liD4MaUNYVKJsClG0Gyi4Cyh4Eyj4Ayv7XCm2Q8yyZz2AJlI0AypYDZacBZbcCZa8AZT8DZYVsMyYbxrRvYvABymYDZbuAsiuBsieAss+BsmxAWdWA6mUu+bOOAgAWT1lDVdvCOAAAAABJRU5ErkJggg=='],
  [4, 1, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAYAAACXU8ZrAAAAKklEQVR4nGNk0A5rlCcAGIXtMqcQVKQWWLOcoCLLlP5dBBX5lC86S0gRAM+pG2i7XuW6AAAAAElFTkSuQmCC'],
  [4, 2, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAYAAACXU8ZrAAAANUlEQVR4nGNi0A5rlPcqXWCXOWV/bMfmezXLL/2dfeyjzK6nAtY3WfSjfij7VTIJEwHorAgAcn8cPczH9/EAAAAASUVORK5CYII='],
  [4, 3, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAYAAACXU8ZrAAAAUklEQVR4nGNm0A5rlDf1StB3icq3C8ms90uu7Ist7piX2zRDt2aSum2PorkPs7CmXYgkLjATQjHLGnnE4pSFspjVbALTccpCAbOBa3QBLlNgAADj9yBmgM1hhwAAAABJRU5ErkJggg=='],
  [4, 4, 'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAFCAYAAACXU8ZrAAAAJ0lEQVR4nGNh0A5rlCcAWISxA3kwggJsiuTRWThMQlWHrghFFsYBAG7hEBO5VG+0AAAAAElFTkSuQmCC'],
] as const

describe('PNG screenshot decoder', () => {
  it.each(fixtures)('decodes channels=%i filter=%i', (channels, _filter, encoded) => {
    const image = decodePng(Buffer.from(encoded, 'base64'))
    expect([image.width, image.height]).toEqual([9, 5])
    const expected: number[] = []
    for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) for (let c = 0; c < 4; c++) expected.push(c === 3 && channels === 3 ? 255 : (x * 31 + y * 19 + c * 43) % 256)
    expect(Array.from(image.data)).toEqual(expected)
  })
  it('reads the expected simulated satellite colour at the failed canvas dimensions', () => {
    expect(dominantPngColor(solidPng(1134, 793, [120, 40, 120]))).toEqual([120, 40, 120])
  })
  it('does not accept a black canvas as rendered satellite imagery', () => {
    expect(colorsClose(dominantPngColor(solidPng(64, 64, [0, 0, 0])), [120, 40, 120])).toBe(false)
  })
  it('rejects invalid or truncated captures instead of returning a default colour', () => {
    expect(() => decodePng(Buffer.from('not PNG'))).toThrow(/signature/)
    expect(() => decodePng(solidPng(9, 5, [120, 40, 120]).subarray(0, 30))).toThrow(/Truncated|Incomplete/)
  })
})
