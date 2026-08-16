import { describe, expect, it, vi } from 'vitest'
import { MapLibreProvider } from './MapLibreProvider'

// jsdom has no WebGL, so the real maplibre-gl Map can't initialize — mock
// it with just enough surface to verify *our* wiring (call order, which
// layers get touched, which style URL gets requested), which is exactly
// the kind of bug a fully-mocked MapProvider (see MapPage.test.tsx)
// can't catch: it never runs this file.
// vi.mock's factory is hoisted above regular declarations, so the fakes it
// references must be created via vi.hoisted() instead of plain `class`.
const { calls, mapInstances, markerInstances, FakeMap, FakeMarker, FakeNavigationControl } =
  vi.hoisted(() => {
    const calls: string[] = []
    const existingLayers = new Set(['contour', 'contour_index', 'contour_label', 'water'])

    class FakeNavigationControl {
      onAdd() {
        return document.createElement('div')
      }
    }

    class FakeMarker {
      lngLat: [number, number] | undefined
      element: HTMLElement | undefined
      draggable: boolean | undefined
      handlers: Record<string, (() => void)[]> = {}
      constructor(options?: { element?: HTMLElement; draggable?: boolean }) {
        this.element = options?.element
        this.draggable = options?.draggable
        markerInstances.push(this)
      }
      setLngLat(lngLat: [number, number]) {
        calls.push('setLngLat')
        this.lngLat = lngLat
        return this
      }
      getLngLat() {
        return { lng: this.lngLat?.[0] ?? 0, lat: this.lngLat?.[1] ?? 0 }
      }
      getElement() {
        return this.element
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
      on(event: string, handler: () => void) {
        ;(this.handlers[event] ??= []).push(handler)
        return this
      }
      fire(event: string) {
        for (const handler of this.handlers[event] ?? []) handler()
      }
      remove() {
        calls.push('remove')
        return this
      }
    }

    class FakeMap {
      style: string
      handlers: Record<string, ((...args: never[]) => void)[]> = {}
      setStyleCalls: string[] = []
      layoutProps: Record<string, string> = {}
      sources: Record<string, { data: unknown; setDataCalls: unknown[] }> = {}
      layerIds: string[] = []
      constructor(options: { style: string }) {
        this.style = options.style
        mapInstances.push(this)
      }
      addControl() {
        /* not under test */
      }
      addSource(id: string, source: { data: unknown }) {
        this.sources[id] = { data: source.data, setDataCalls: [] }
      }
      getSource(id: string) {
        const source = this.sources[id]
        if (!source) return undefined
        return {
          setData: (data: unknown) => {
            source.data = data
            source.setDataCalls.push(data)
          },
        }
      }
      addLayer(layer: { id: string }) {
        this.layerIds.push(layer.id)
      }
      on(event: string, handler: (...args: never[]) => void) {
        ;(this.handlers[event] ??= []).push(handler)
      }
      fire(event: string, ...args: unknown[]) {
        for (const handler of this.handlers[event] ?? []) (handler as (...a: unknown[]) => void)(...args)
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
        this.style = url
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
    const markerInstances: InstanceType<typeof FakeMarker>[] = []

    return { calls, mapInstances, markerInstances, FakeMap, FakeMarker, FakeNavigationControl }
  })

vi.mock('maplibre-gl', () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: FakeNavigationControl,
  setWorkerUrl: vi.fn(),
}))

function createTestMap(
  provider = new MapLibreProvider({ mapTiler: 'maptiler-test-key', esri: 'esri-test-key' }),
) {
  return provider.createMap({
    container: document.createElement('div'),
    initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
    initialBaseLayer: 'outdoor',
    initialOverlays: { trails: true, hydrography: true, contours: true },
  })
}

describe('MapLibreProvider', () => {
  describe('style URLs', () => {
    it('resolves MapTiler base layers to MapTiler style URLs', () => {
      mapInstances.length = 0
      const provider = new MapLibreProvider({ mapTiler: 'mt-key' })
      const instance = provider.createMap({
        container: document.createElement('div'),
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'satellite',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      expect(mapInstances[0].style).toBe(
        'https://api.maptiler.com/maps/satellite/style.json?key=mt-key',
      )

      instance.setBaseLayer('outdoor')
      expect(mapInstances[0].setStyleCalls.at(-1)).toBe(
        'https://api.maptiler.com/maps/outdoor/style.json?key=mt-key',
      )
    })

    it('resolves Esri base layers to the Basemap Styles v2 endpoint with the right style name', () => {
      mapInstances.length = 0
      const provider = new MapLibreProvider({ esri: 'esri-key' })
      const instance = provider.createMap({
        container: document.createElement('div'),
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'esri-topographic',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      expect(mapInstances[0].style).toBe(
        'https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/topographic?token=esri-key',
      )

      instance.setBaseLayer('esri-hillshade')
      expect(mapInstances[0].setStyleCalls.at(-1)).toBe(
        'https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/hillshade/light?token=esri-key',
      )
    })
  })

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

  it('reports the clicked coordinate via onMapClick', () => {
    mapInstances.length = 0
    const onMapClick = vi.fn()
    const provider = new MapLibreProvider({ mapTiler: 'test-key' })
    provider.createMap({
      container: document.createElement('div'),
      initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
      initialBaseLayer: 'outdoor',
      initialOverlays: { trails: true, hydrography: true, contours: true },
      onMapClick,
    })

    mapInstances[0].fire('click', { lngLat: { lat: 46.8, lng: -71.2 } })
    expect(onMapClick).toHaveBeenCalledWith({ lat: 46.8, lng: -71.2 })
  })

  describe('waypoint markers', () => {
    const waypointA = {
      id: 'a',
      name: 'A',
      coordinate: { lat: 1, lng: 1 },
      category: 'general' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const waypointB = {
      ...waypointA,
      id: 'b',
      coordinate: { lat: 2, lng: 2 },
    }

    it('positions each new waypoint marker before adding it to the map', () => {
      calls.length = 0
      const instance = createTestMap()

      expect(() => instance.setWaypoints([waypointA])).not.toThrow()
      expect(calls).toEqual(['setLngLat', 'addTo'])
    })

    it('updates an existing waypoint marker in place rather than recreating it', () => {
      markerInstances.length = 0
      const instance = createTestMap()

      instance.setWaypoints([waypointA])
      instance.setWaypoints([{ ...waypointA, coordinate: { lat: 5, lng: 5 } }])

      expect(markerInstances).toHaveLength(1)
      expect(markerInstances[0].lngLat).toEqual([5, 5])
    })

    it('removes markers for waypoints no longer in the list', () => {
      markerInstances.length = 0
      const instance = createTestMap()

      instance.setWaypoints([waypointA, waypointB])
      instance.setWaypoints([waypointB])

      expect(markerInstances).toHaveLength(2) // none recreated
      const [markerA] = markerInstances
      // markerA was the one dropped from the second call.
      expect(markerA.lngLat).toEqual([1, 1])
    })

    it('reports the clicked waypoint id via onWaypointClick, without also firing onMapClick', () => {
      markerInstances.length = 0
      const onMapClick = vi.fn()
      const onWaypointClick = vi.fn()
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container: document.createElement('div'),
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
        onMapClick,
        onWaypointClick,
      })

      instance.setWaypoints([waypointA])
      markerInstances[0].element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      expect(onWaypointClick).toHaveBeenCalledWith('a')
      expect(onMapClick).not.toHaveBeenCalled()
    })

    it('creates waypoint markers as draggable and reports the drop position via onWaypointDragEnd', () => {
      markerInstances.length = 0
      const onWaypointDragEnd = vi.fn()
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container: document.createElement('div'),
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
        onWaypointDragEnd,
      })

      instance.setWaypoints([waypointA])
      expect(markerInstances[0].draggable).toBe(true)

      markerInstances[0].setLngLat([9, 8]) // simulates the drag moving the marker
      markerInstances[0].fire('dragend')

      expect(onWaypointDragEnd).toHaveBeenCalledWith('a', { lat: 8, lng: 9 })
    })
  })

  describe('track preview', () => {
    it('adds the live track line layer once the style has loaded', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      map.fire('style.load')

      expect(map.layerIds).toContain('track-preview-line')
      expect(map.sources['track-preview'].data).toEqual({ type: 'FeatureCollection', features: [] })

      // setTrackPreview before the style loads would find no source yet —
      // guard against a crash in that ordering.
      expect(() => instance.setTrackPreview([{ lat: 1, lng: 1 }])).not.toThrow()
    })

    it('draws a line once at least two points are recorded, and clears it when told to', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setTrackPreview([{ lat: 46.8, lng: -71.2 }])
      expect(map.sources['track-preview'].data).toEqual({ type: 'FeatureCollection', features: [] })

      instance.setTrackPreview([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.801, lng: -71.2 },
      ])
      expect(map.sources['track-preview'].data).toEqual({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [-71.2, 46.8],
                [-71.2, 46.801],
              ],
            },
          },
        ],
      })

      instance.setTrackPreview(null)
      expect(map.sources['track-preview'].data).toEqual({ type: 'FeatureCollection', features: [] })
    })

    it('re-adds the track preview layer after a base layer switch reloads the style', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setBaseLayer('satellite')
      map.layerIds = []
      map.sources = {}
      map.fire('style.load')

      expect(map.layerIds).toContain('track-preview-line')
    })
  })
})
