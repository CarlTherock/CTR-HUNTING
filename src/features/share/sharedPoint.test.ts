import { describe, expect, it } from 'vitest'
import {
  buildAppLink,
  parseSharedPoint,
  sanitizeSharedName,
  SHARED_NAME_MAX_LENGTH,
} from './sharedPoint'

describe('parseSharedPoint', () => {
  it('returns none when the URL carries no shared-point parameter', () => {
    expect(parseSharedPoint('')).toEqual({ kind: 'none' })
    expect(parseSharedPoint('?utm_source=x')).toEqual({ kind: 'none' })
  })

  it('accepts a valid link', () => {
    expect(parseSharedPoint('?p=46.8139,-71.208&n=Mirador')).toEqual({
      kind: 'valid',
      point: { coordinate: { lat: 46.8139, lng: -71.208 }, name: 'Mirador' },
    })
  })

  it('accepts an encoded comma, extremes and a missing name', () => {
    expect(parseSharedPoint('?p=-90%2C180')).toEqual({
      kind: 'valid',
      point: { coordinate: { lat: -90, lng: 180 }, name: 'Point partagé' },
    })
    expect(parseSharedPoint('?p=0,0')).toMatchObject({ kind: 'valid' })
  })

  it('ignores unrelated parameters', () => {
    expect(parseSharedPoint('?x=1&p=10,20&n=A&utm=z')).toMatchObject({ kind: 'valid' })
  })

  it.each([
    ['latitude too large', '?p=90.0001,10'],
    ['latitude too small', '?p=-91,10'],
    ['longitude too large', '?p=10,180.5'],
    ['longitude too small', '?p=10,-181'],
    ['NaN', '?p=NaN,10'],
    ['Infinity', '?p=Infinity,10'],
    ['exponent', '?p=1e1,10'],
    ['empty', '?p='],
    ['one number', '?p=46.8'],
    ['three numbers', '?p=46.8,-71.2,5'],
    ['trailing junk', '?p=46.8,-71.2abc'],
    ['spaces', '?p=46.8, -71.2'],
    ['semicolon', '?p=46.8;-71.2'],
    ['hex', '?p=0x10,5'],
    ['duplicate p', '?p=1,2&p=3,4'],
    ['duplicate n', '?p=1,2&n=a&n=b'],
    ['name without point', '?n=Mirador'],
    ['script in p', '?p=<script>alert(1)</script>'],
  ])('rejects %s', (_label, search) => {
    expect(parseSharedPoint(search)).toEqual({ kind: 'invalid' })
  })

  it('rejects an absurdly long query string', () => {
    expect(parseSharedPoint(`?p=1,2&n=${'a'.repeat(2000)}`)).toEqual({ kind: 'invalid' })
  })

  it('neutralises an injection attempt in the name (stays plain text)', () => {
    const result = parseSharedPoint(
      `?p=1,2&n=${encodeURIComponent('<img src=x onerror=alert(1)>Camp')}`,
    )
    expect(result).toMatchObject({ kind: 'valid' })
    if (result.kind !== 'valid') return
    expect(result.point.name).not.toMatch(/[<>]/)
    expect(result.point.name).toBe('img src=x onerror=alert(1)Camp')
  })

  it('truncates an overlong name to 80 characters', () => {
    const result = parseSharedPoint(`?p=1,2&n=${'é'.repeat(200)}`)
    expect(result).toMatchObject({ kind: 'valid' })
    if (result.kind !== 'valid') return
    expect(Array.from(result.point.name)).toHaveLength(SHARED_NAME_MAX_LENGTH)
  })

  it('falls back to the default name when sanitising empties it', () => {
    const result = parseSharedPoint('?p=1,2&n=%3C%3E%00%0A')
    expect(result).toMatchObject({
      kind: 'valid',
      point: { name: 'Point partagé' },
    })
  })
})

describe('sanitizeSharedName', () => {
  it('strips control characters and angle brackets and collapses spaces', () => {
    expect(sanitizeSharedName('  a\u0000b\nc\t <b>d</b>  ')).toBe('a b c bd/b')
  })
})

describe('buildAppLink', () => {
  it('targets the app root (no deep path), with encoded name', () => {
    expect(
      buildAppLink(
        'https://carltherock.github.io',
        '/CTR-HUNTING/',
        { lat: 46.8139, lng: -71.208 },
        'Mirador & Cie',
      ),
    ).toBe(
      'https://carltherock.github.io/CTR-HUNTING/?p=46.8139,-71.208&n=Mirador%20%26%20Cie',
    )
  })

  it('never emits an exponent and round-trips through the parser', () => {
    const link = buildAppLink('http://localhost:5173', '/', { lat: 1e-7, lng: -0 }, 'x')
    expect(link).toBe('http://localhost:5173/?p=0.0000001,0&n=x')
    const parsed = parseSharedPoint(new URL(link).search)
    expect(parsed).toMatchObject({ kind: 'valid', point: { coordinate: { lat: 1e-7 } } })
  })

  it('truncates the name to 80 characters and omits an empty one', () => {
    const long = buildAppLink('https://x.test', '/', { lat: 1, lng: 2 }, 'a'.repeat(200))
    const name = new URL(long).searchParams.get('n') ?? ''
    expect(name).toHaveLength(80)
    expect(buildAppLink('https://x.test', '/', { lat: 1, lng: 2 }, '<>')).toBe(
      'https://x.test/?p=1,2',
    )
  })
})
