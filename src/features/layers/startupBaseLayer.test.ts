import { describe, expect, it } from 'vitest'
import { chooseStartupBaseLayer, resolveInitialBaseLayer } from './startupBaseLayer'

describe('chooseStartupBaseLayer', () => {
  it('prefers Esri Imagery Hybrid when its key is configured', () => {
    expect(
      chooseStartupBaseLayer([
        'outdoor',
        'satellite',
        'esri-topographic',
        'esri-imagery',
      ]),
    ).toBe('esri-imagery')
  })

  it('falls back to MapTiler Satellite when only MapTiler is configured', () => {
    expect(chooseStartupBaseLayer(['outdoor', 'satellite'])).toBe('satellite')
  })

  it('falls back to the first available layer otherwise', () => {
    expect(chooseStartupBaseLayer(['esri-topographic', 'esri-terrain'])).toBe(
      'esri-topographic',
    )
  })

  it('returns null when nothing is configured', () => {
    expect(chooseStartupBaseLayer([])).toBeNull()
  })
})

describe('resolveInitialBaseLayer', () => {
  const all = ['outdoor', 'satellite', 'esri-imagery'] as const

  it('ignores the implicit "outdoor" default and starts on the hybrid satellite', () => {
    expect(resolveInitialBaseLayer(all, 'outdoor', false)).toBe('esri-imagery')
  })

  it('keeps a layer the user picked during this session', () => {
    expect(resolveInitialBaseLayer(all, 'outdoor', true)).toBe('outdoor')
  })

  it('drops a user choice whose vendor key is no longer configured', () => {
    expect(resolveInitialBaseLayer(['satellite'], 'esri-terrain', true)).toBe('satellite')
  })
})
