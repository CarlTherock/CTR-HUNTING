import { describe, expect, it } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { createRasterOverlays } from './rasterLayers'

/** Mimics MapLibre: addSource/addLayer throw until the style has loaded. */
function fakeMap() {
  const state = {
    styleLoaded: false,
    sources: new Set<string>(),
    layers: new Set<string>(),
  }
  const map = {
    getLayer: (id: string) => (state.layers.has(id) ? {} : undefined),
    removeLayer: (id: string) => state.layers.delete(id),
    removeSource: (id: string) => state.sources.delete(id),
    addSource: (id: string) => {
      if (!state.styleLoaded) throw new Error('Style is not done loading.')
      state.sources.add(id)
    },
    addLayer: (layer: { id: string }) => {
      if (!state.styleLoaded) throw new Error('Style is not done loading.')
      state.layers.add(layer.id)
    },
  }
  return { map: map as unknown as MapLibreMap, state }
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
})
