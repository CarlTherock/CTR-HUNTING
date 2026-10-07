import { describe, expect, it, vi } from 'vitest'
import {
  baseLayerFailureNotice,
  chooseStartupBaseLayer,
  nextFallbackLayer,
  resolveInitialBaseLayer,
  startupFallbackNotice,
} from './startupBaseLayer'

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

describe('fallback messages', () => {
  it('startupFallbackNotice is null on the hybrid view and explicit otherwise', () => {
    expect(
      startupFallbackNotice(['esri-imagery', 'satellite'], 'esri-imagery'),
    ).toBeNull()
    expect(startupFallbackNotice(['outdoor', 'satellite'], 'satellite')).toContain(
      'clé Esri',
    )
  })

  it('nextFallbackLayer skips layers that already failed and ends with null', () => {
    const available = ['esri-imagery', 'satellite', 'outdoor'] as const
    expect(nextFallbackLayer(available, ['esri-imagery'])).toBe('satellite')
    expect(nextFallbackLayer(available, ['esri-imagery', 'satellite'])).toBe('outdoor')
    expect(nextFallbackLayer(available, [...available])).toBeNull()
  })

  it('baseLayerFailureNotice names the failed layer and the fallback', () => {
    expect(baseLayerFailureNotice('esri-imagery', 'satellite')).toContain(
      'repli sur « Satellite »',
    )
    expect(baseLayerFailureNotice('satellite', null)).toContain('Aucun autre fond')
  })
})

describe('no persisted base layer', () => {
  it('an old stored preference never changes the cold-launch layer', async () => {
    // Seed every place an older version could have stored a preference.
    localStorage.setItem('baseLayer', 'outdoor')
    localStorage.setItem(
      'layers-storage',
      JSON.stringify({ state: { baseLayer: 'outdoor' } }),
    )
    const { db } = await import('@/database/db')
    await db.settings.put({ key: 'baseLayer', value: 'outdoor' })

    vi.resetModules()
    const { useLayersStore } = await import('./state/layersStore')
    const state = useLayersStore.getState()
    expect(state.baseLayerChosenByUser).toBe(false)
    expect(
      resolveInitialBaseLayer(
        ['outdoor', 'satellite', 'esri-imagery'],
        state.baseLayer,
        state.baseLayerChosenByUser,
      ),
    ).toBe('esri-imagery')
    localStorage.clear()
  })
})
