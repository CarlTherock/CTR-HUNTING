import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { OverlayStatus } from '@/types'
import { createRasterOverlays } from './rasterLayers'

type Listener = (event: object) => void

/** Mimics MapLibre: addSource/addLayer throw until the style has loaded. */
function fakeMap() {
  const state = {
    styleLoaded: false,
    sources: new Map<string, Record<string, unknown>>(),
    layers: new Set<string>(),
    opacity: new Map<string, number>(),
    sourceLoaded: false,
    listeners: new Map<string, Listener[]>(),
  }
  const map = {
    getLayer: (id: string) => (state.layers.has(id) ? {} : undefined),
    removeLayer: (id: string) => state.layers.delete(id),
    removeSource: (id: string) => state.sources.delete(id),
    addSource: (id: string, spec: Record<string, unknown>) => {
      if (!state.styleLoaded) throw new Error('Style is not done loading.')
      state.sources.set(id, spec)
    },
    addLayer: (layer: { id: string }) => {
      if (!state.styleLoaded) throw new Error('Style is not done loading.')
      state.layers.add(layer.id)
    },
    setPaintProperty: (id: string, _prop: string, value: number) => {
      state.opacity.set(id, value)
    },
    isSourceLoaded: () => state.sourceLoaded,
    on: (type: string, listener: Listener) => {
      state.listeners.set(type, [...(state.listeners.get(type) ?? []), listener])
    },
  }
  const emit = (type: string, event: object) =>
    state.listeners.get(type)?.forEach((listener) => listener(event))
  return { map: map as unknown as MapLibreMap, state, emit }
}

describe('createRasterOverlays', () => {
  it('does not throw when an overlay is requested before the style has loaded, and adds it once it has', () => {
    const { map, state } = fakeMap()
    const overlays = createRasterOverlays(map)

    // e.g. returning to the map page with a forest layer still enabled in
    // the (module-global) store: the effect runs before `style.load`.
    expect(() =>
      overlays.set('forest-cadastre', 'https://example.com/{z}/{x}/{y}', 0.6),
    ).not.toThrow()
    expect(state.layers.size).toBe(0)

    state.styleLoaded = true
    overlays.applyAll()

    expect(state.layers.has('raster-overlay-forest-cadastre-layer')).toBe(true)
  })

  it('removes an overlay when passed null', () => {
    const { map, state } = fakeMap()
    state.styleLoaded = true
    const overlays = createRasterOverlays(map)
    overlays.set('radar', 'https://example.com/{z}/{x}/{y}', 0.5)
    expect(state.layers.has('raster-overlay-radar-layer')).toBe(true)

    overlays.set('radar', null, 0.5)

    expect(state.layers.has('raster-overlay-radar-layer')).toBe(false)
    expect(state.sources.has('raster-overlay-radar')).toBe(false)
  })

  it('passes the required attribution to the raster source so the map displays it', () => {
    const { map, state } = fakeMap()
    state.styleLoaded = true
    const overlays = createRasterOverlays(map)

    overlays.set(
      'forest-lidar-ombre',
      'https://example.com/{bbox-epsg-3857}',
      0.6,
      '© Test',
    )

    expect(state.sources.get('raster-overlay-forest-lidar-ombre')?.attribution).toBe(
      '© Test',
    )
  })

  it('only moves the opacity when the same overlay is re-set (no reload, error stays latched)', () => {
    const { map, state, emit } = fakeMap()
    state.styleLoaded = true
    const statuses: OverlayStatus[] = []
    const overlays = createRasterOverlays(map, (_id, status) => statuses.push(status))
    const url = 'https://example.com/{bbox-epsg-3857}'
    overlays.set('a', url, 0.5, '© A')
    emit('error', { sourceId: 'raster-overlay-a' })

    const addSource = vi.spyOn(map, 'addSource')
    overlays.set('a', url, 0.9, '© A')

    expect(addSource).not.toHaveBeenCalled()
    expect(state.opacity.get('raster-overlay-a-layer')).toBe(0.9)
    expect(statuses.at(-1)?.state).toBe('error')
  })

  describe('load status', () => {
    function setup() {
      const ctx = fakeMap()
      ctx.state.styleLoaded = true
      const events: [string, OverlayStatus][] = []
      const overlays = createRasterOverlays(ctx.map, (id, status) =>
        events.push([id, status]),
      )
      overlays.set('a', 'https://example.com/{bbox-epsg-3857}', 0.5)
      return { ...ctx, overlays, events }
    }

    it('reports loading when added, then ready once the source has loaded', () => {
      const { events, emit, state } = setup()
      expect(events.at(-1)).toEqual(['a', { state: 'loading' }])

      state.sourceLoaded = false
      emit('data', { sourceId: 'raster-overlay-a' })
      expect(events.at(-1)?.[1].state).toBe('loading')

      state.sourceLoaded = true
      emit('data', { sourceId: 'raster-overlay-a' })
      expect(events.at(-1)).toEqual(['a', { state: 'ready' }])
    })

    it('reports a visible error when a tile of the overlay fails, and does not flip back to ready', () => {
      const { events, emit, state } = setup()

      emit('error', { sourceId: 'raster-overlay-a', error: new Error('boom') })
      const last = events.at(-1)?.[1]
      expect(last?.state).toBe('error')
      expect(last?.message).toMatch(/Chargement impossible/)

      state.sourceLoaded = true
      emit('data', { sourceId: 'raster-overlay-a' })
      expect(events.at(-1)?.[1].state).toBe('error')
    })

    it('ignores events of other sources (base map, weather)', () => {
      const { events, emit } = setup()
      const before = events.length

      emit('error', { sourceId: 'composite' })
      emit('error', { sourceId: 'raster-overlay-unknown' })
      emit('data', { sourceId: undefined })

      expect(events.length).toBe(before)
    })

    it('resets to idle when the overlay is removed, and clears a latched error on re-add', () => {
      const { events, emit, overlays } = setup()
      emit('error', { sourceId: 'raster-overlay-a' })

      overlays.set('a', null, 0.5)
      expect(events.at(-1)).toEqual(['a', { state: 'idle' }])

      overlays.set('a', 'https://example.com/{bbox-epsg-3857}', 0.5)
      expect(events.at(-1)).toEqual(['a', { state: 'loading' }])
    })
  })
})
