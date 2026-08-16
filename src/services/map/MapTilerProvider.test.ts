import { describe, expect, it, vi } from 'vitest'
import { MapTilerProvider } from './MapTilerProvider'

// jsdom has no WebGL, so the real maplibre-gl Map can't initialize — mock
// it with just enough surface to verify *our* wiring (call order, which
// layers get touched), which is exactly the kind of bug a fully-mocked
// MapProvider (see MapPage.test.tsx) can't catch: it never runs this file.
// vi.mock's factory is hoisted above regular declarations, so the fakes it
// references must be created via vi.hoisted() instead of plain `class`.
const { calls, mapInstances, FakeMap, FakeMarker, FakeNavigationControl } = vi.hoisted(() => {
  const calls: string[] = []
  const existingLayers = new Set(['contour', 'contour_index', 'contour_label', 'water'])

  class FakeNavigationControl {
    onAdd() {
      return document.createElement('div')
    }
  }

  class FakeMarker {
    lngLat: [number, number] | undefined
    setLngLat(lngLat: [number, number]) {
      calls.push('setLngLat')
      this.lngLat = lngLat
      return this
    }
    addTo() {
      calls.push('addTo')
      // Mirrors the real bug: MapLibre's Marker.addTo() immediately reads
      // `this.lngLat.lng` to position itself — throws if unset.
      if (!this.lngLat) {
        throw new TypeError("Cannot read properties of undefined (reading 'lng')")
      }
      return this
    }
    remove() {
      calls.push('remove')
      return this
    }
  }

  class FakeMap {
    handlers: Record<string, (() => void)[]> = {}
    setStyleCalls: string[] = []
    layoutProps: Record<string, string> = {}
    constructor(_options: unknown) {
      mapInstances.push(this)
    }
    addControl() {
      /* not under test */
    }
    on(event: string, handler: () => void) {
      ;(this.handlers[event] ??= []).push(handler)
    }
    fire(event: string) {
      for (const handler of this.handlers[event] ?? []) handler()
    }
    getCenter() {
      return { lat: 0, lng: 0 }
    }
    getZoom() {
      return 0
    }
    getPitch() {
      return 0
    }
    getBearing() {
      return 0
    }
    setCenter() {
      /* not under test */
    }
    setZoom() {
      /* not under test */
    }
    setPitch() {
      /* not under test */
    }
    setBearing() {
      /* not under test */
    }
    setStyle(url: string) {
      this.setStyleCalls.push(url)
    }
    getLayer(id: string) {
      return existingLayers.has(id) ? {} : undefined
    }
    setLayoutProperty(id: string, _prop: string, value: string) {
      this.layoutProps[id] = value
    }
    remove() {
      /* not under test */
    }
  }

  const mapInstances: InstanceType<typeof FakeMap>[] = []

  return { calls, mapInstances, FakeMap, FakeMarker, FakeNavigationControl }
})

vi.mock('maplibre-gl', () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: FakeNavigationControl,
  setWorkerUrl: vi.fn(),
}))

function createTestMap() {
  const provider = new MapTilerProvider('test-key')
  return provider.createMap({
    container: document.createElement('div'),
    initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
    initialBaseLayer: 'outdoor',
    initialOverlays: { trails: true, hydrography: true, contours: true },
  })
}

describe('MapTilerProvider', () => {
  it('positions a new user-location marker before adding it to the map', () => {
    calls.length = 0
    const instance = createTestMap()

    expect(() =>
      instance.setUserLocationMarker({ lat: 46.8, lng: -71.2, accuracyMeters: 8 }),
    ).not.toThrow()

    expect(calls).toEqual(['setLngLat', 'addTo'])
  })

  it('updates an existing marker in place rather than recreating it', () => {
    calls.length = 0
    const instance = createTestMap()

    instance.setUserLocationMarker({ lat: 46.8, lng: -71.2 })
    instance.setUserLocationMarker({ lat: 47, lng: -72 })

    expect(calls).toEqual(['setLngLat', 'addTo', 'setLngLat'])
  })

  it('removes the marker when the position becomes unavailable', () => {
    calls.length = 0
    const instance = createTestMap()

    instance.setUserLocationMarker({ lat: 46.8, lng: -71.2 })
    instance.setUserLocationMarker(null)

    expect(calls).toEqual(['setLngLat', 'addTo', 'remove'])
  })

  it('only sets layout properties on layers that actually exist in the style', () => {
    mapInstances.length = 0
    const instance = createTestMap()
    const map = mapInstances[0]

    // Doesn't throw for e.g. waterway_river — not in existingLayers, so
    // getLayer() returns undefined and it's silently skipped.
    expect(() => instance.setOverlayVisible('hydrography', false)).not.toThrow()
    expect(map.layoutProps.water).toBe('none')
    expect(map.layoutProps.waterway_river).toBeUndefined()

    instance.setOverlayVisible('contours', false)
    expect(map.layoutProps.contour).toBe('none')
    expect(map.layoutProps.contour_index).toBe('none')
  })

  it('re-applies overlay visibility after a base layer switch reloads the style', () => {
    mapInstances.length = 0
    const instance = createTestMap()
    const map = mapInstances[0]

    instance.setOverlayVisible('contours', false)
    instance.setBaseLayer('satellite')
    expect(map.setStyleCalls).toHaveLength(1)

    // setStyle() would have reset layout properties on a real style parse;
    // our style.load handler must reapply the last-known overlay state.
    map.layoutProps = {}
    map.fire('style.load')
    expect(map.layoutProps.contour).toBe('none')
  })
})
