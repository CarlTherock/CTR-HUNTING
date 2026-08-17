import { afterEach, describe, expect, it, vi } from 'vitest'
import { MapLibreProvider } from './MapLibreProvider'

// jsdom has no WebGL, so the real maplibre-gl Map can't initialize — mock
// it with just enough surface to verify *our* wiring (call order, which
// layers get touched, which style URL gets requested), which is exactly
// the kind of bug a fully-mocked MapProvider (see MapPage.test.tsx)
// can't catch: it never runs this file.
// vi.mock's factory is hoisted above regular declarations, so the fakes it
// references must be created via vi.hoisted() instead of plain `class`.
const {
  calls,
  mapInstances,
  markerInstances,
  registeredProtocols,
  FakeMap,
  FakeMarker,
  FakeNavigationControl,
  fakeAddProtocol,
} = vi.hoisted(() => {
    const calls: string[] = []
    const existingLayers = new Set(['contour', 'contour_index', 'contour_label', 'water'])
    const registeredProtocols: Record<
      string,
      (params: { url: string }, ac: AbortController) => Promise<{ data: ArrayBuffer }>
    > = {}
    const fakeAddProtocol = (name: string, handler: (typeof registeredProtocols)[string]) => {
      registeredProtocols[name] = handler
    }

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
      transformRequest?: (url: string, resourceType?: string) => { url: string } | undefined
      maxPitch?: number | null
      constructor(options: {
        style: string
        transformRequest?: (url: string, resourceType?: string) => { url: string } | undefined
        maxPitch?: number | null
      }) {
        this.style = options.style
        this.transformRequest = options.transformRequest
        this.maxPitch = options.maxPitch
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
      terrainCalls: unknown[] = []
      elevationByLngLat: Record<string, number> = {}
      setTerrain(options: unknown) {
        this.terrainCalls.push(options)
      }
      queryTerrainElevation([lng, lat]: [number, number]) {
        return this.elevationByLngLat[`${lng},${lat}`] ?? null
      }
      jumpToCalls: unknown[] = []
      once(_event: string, handler: (...args: never[]) => void) {
        // Resolves asynchronously (not synchronously) so callers awaiting
        // a promise built from this — like `waitForIdle` — behave like
        // they would against a real, async-settling map.
        queueMicrotask(() => (handler as () => void)())
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
      getBounds() {
        return {
          getWest: () => -71.3,
          getSouth: () => 46.7,
          getEast: () => -71.1,
          getNorth: () => 46.9,
        }
      }
      jumpTo(view: unknown) {
        this.jumpToCalls.push(view)
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

    return {
      calls,
      mapInstances,
      markerInstances,
      registeredProtocols,
      FakeMap,
      FakeMarker,
      FakeNavigationControl,
      fakeAddProtocol,
    }
  })

vi.mock('maplibre-gl', () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: FakeNavigationControl,
  setWorkerUrl: vi.fn(),
  addProtocol: fakeAddProtocol,
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
  it('raises maxPitch above MapLibre\'s 60° default so 3D can reach a near-eye-level tilt', () => {
    mapInstances.length = 0
    createTestMap()
    expect(mapInstances[0].maxPitch).toBe(85)
  })

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

  describe('measure path (elevation profile, Phase 4)', () => {
    it('adds a point layer and a line layer once the style has loaded', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      map.fire('style.load')

      expect(map.layerIds).toContain('measure-path-points')
      expect(map.layerIds).toContain('measure-path-line')
      expect(map.sources['measure-path'].data).toEqual({ type: 'FeatureCollection', features: [] })
      expect(() => instance.setMeasurePath([{ lat: 1, lng: 1 }])).not.toThrow()
    })

    it('shows a point as soon as it is set, before any line is possible', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setMeasurePath([{ lat: 46.8, lng: -71.2 }])

      expect(map.sources['measure-path'].data).toEqual({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [-71.2, 46.8] },
          },
        ],
      })
    })

    it('adds a connecting line once there are 2+ points, alongside the point dots', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setMeasurePath([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.81, lng: -71.2 },
        { lat: 46.81, lng: -71.19 },
      ])

      const data = map.sources['measure-path'].data as { features: { geometry: { type: string } }[] }
      expect(data.features.filter((f) => f.geometry.type === 'Point')).toHaveLength(3)
      expect(data.features.filter((f) => f.geometry.type === 'LineString')).toHaveLength(1)
    })

    it('clears both points and line when set to null', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setMeasurePath([
        { lat: 46.8, lng: -71.2 },
        { lat: 46.81, lng: -71.2 },
      ])
      instance.setMeasurePath(null)

      expect(map.sources['measure-path'].data).toEqual({ type: 'FeatureCollection', features: [] })
    })

    it('re-adds the measure path layers after a base layer switch reloads the style', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setBaseLayer('satellite')
      map.layerIds = []
      map.sources = {}
      map.fire('style.load')

      expect(map.layerIds).toContain('measure-path-points')
      expect(map.layerIds).toContain('measure-path-line')
    })
  })

  describe('wind flow field (Phase 6)', () => {
    const FIELD = {
      timezone: 'America/Toronto',
      samples: [
        {
          coordinate: { lat: 0, lng: 0 },
          hourly: [
            {
              time: '2026-08-17T10:00',
              directionDegrees: 270,
              speedKmh: 12,
              gustsKmh: 20,
              temperatureCelsius: 18,
              precipitationMm: 0.5,
              cloudCoverPercent: 40,
            },
          ],
        },
      ],
    }

    it('adds a canvas overlay to the container on creation', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      expect(container.querySelector('canvas')).not.toBeNull()
    })

    it('setWindField does not throw when enabling, updating, or clearing the field', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      expect(() => instance.setWindField(FIELD, 0, 'wind')).not.toThrow()
      expect(() => instance.setWindField(FIELD, 1, 'wind')).not.toThrow()
      expect(() => instance.setWindField(null, 0, 'wind')).not.toThrow()
    })

    it('setWindField does not throw for any non-wind layer (temperature/precipitation/clouds)', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      expect(() => instance.setWindField(FIELD, 0, 'temperature')).not.toThrow()
      expect(() => instance.setWindField(FIELD, 0, 'precipitation')).not.toThrow()
      expect(() => instance.setWindField(FIELD, 0, 'clouds')).not.toThrow()
    })

    it('removes the canvas overlay on destroy', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      instance.setWindField(FIELD, 0, 'wind')
      instance.destroy()

      expect(container.querySelector('canvas')).toBeNull()
    })
  })

  describe('terrain (Phase 4)', () => {
    it('does not enable terrain by default', () => {
      mapInstances.length = 0
      createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      expect(map.terrainCalls).toEqual([])
    })

    it('setTerrainEnabled(true, exaggeration) calls setTerrain with the DEM source and exaggeration', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      instance.setTerrainEnabled(true, 2)

      expect(map.terrainCalls).toEqual([{ source: 'terrain-dem', exaggeration: 2 }])
    })

    it('setTerrainEnabled(false, …) calls setTerrain(null)', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      instance.setTerrainEnabled(true, 2)
      instance.setTerrainEnabled(false, 2)

      expect(map.terrainCalls.at(-1)).toBeNull()
    })

    it('re-enables terrain automatically after a base layer switch reloads the style', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setTerrainEnabled(true, 1.5)
      map.terrainCalls = []
      instance.setBaseLayer('satellite')
      map.fire('style.load')

      expect(map.terrainCalls).toEqual([{ source: 'terrain-dem', exaggeration: 1.5 }])
    })

    it('queryElevation delegates to the engine and returns null when unavailable', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.elevationByLngLat['-71.2,46.8'] = 312

      expect(instance.queryElevation({ lat: 46.8, lng: -71.2 })).toBe(312)
      expect(instance.queryElevation({ lat: 0, lng: 0 })).toBeNull()
    })
  })

  describe('getBounds', () => {
    it('converts the engine LngLatBounds into a plain object', () => {
      const instance = createTestMap()
      expect(instance.getBounds()).toEqual({
        west: -71.3,
        south: 46.7,
        east: -71.1,
        north: 46.9,
      })
    })
  })

  describe('offline tile requests (transformRequest)', () => {
    it('redirects Tile resource requests through the custom ctrtile:// protocol', () => {
      mapInstances.length = 0
      createTestMap()
      const map = mapInstances[0]

      const result = map.transformRequest?.('https://api.maptiler.com/tiles/v3/5/10/12.pbf', 'Tile')
      expect(result).toEqual({ url: 'ctrtile://api.maptiler.com/tiles/v3/5/10/12.pbf' })
    })

    it('leaves non-Tile requests (style, sprite, glyphs) untouched', () => {
      mapInstances.length = 0
      createTestMap()
      const map = mapInstances[0]

      expect(
        map.transformRequest?.('https://api.maptiler.com/maps/outdoor/style.json', 'Style'),
      ).toBeUndefined()
    })
  })

  describe('ctrtile:// protocol handler (registered once, module-wide)', () => {
    class FakeCache {
      store = new Map<string, Response>()
      async match(url: string) {
        return this.store.get(url)
      }
      async put(url: string, response: Response) {
        this.store.set(url, response)
      }
    }

    function installFakeCaches() {
      const cache = new FakeCache()
      vi.stubGlobal('caches', { open: async () => cache })
      return cache
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('fetches and caches a real tile on a cache miss', async () => {
      createTestMap() // ensures the protocol is registered at least once
      const cache = installFakeCaches()
      const bytes = new Uint8Array(500)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })))

      const handler = registeredProtocols.ctrtile
      const result = await handler(
        { url: 'ctrtile://api.maptiler.com/tiles/v3/5/10/12.pbf' },
        new AbortController(),
      )

      expect(result.data).toBeInstanceOf(ArrayBuffer)
      expect((result.data as ArrayBuffer).byteLength).toBe(500)
      expect(await cache.match('https://api.maptiler.com/tiles/v3/5/10/12.pbf')).toBeDefined()
      expect(fetch).toHaveBeenCalledWith(
        'https://api.maptiler.com/tiles/v3/5/10/12.pbf',
        expect.anything(),
      )
    })

    it('serves from cache on a hit, without a network fetch', async () => {
      createTestMap()
      const cache = installFakeCaches()
      const realUrl = 'https://api.maptiler.com/tiles/v3/5/10/12.pbf'
      await cache.put(realUrl, new Response(new Uint8Array(42), { status: 200 }))
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)

      const result = await registeredProtocols.ctrtile(
        { url: `ctrtile://${realUrl.replace('https://', '')}` },
        new AbortController(),
      )

      expect((result.data as ArrayBuffer).byteLength).toBe(42)
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('downloadArea', () => {
    it('sweeps the camera across every target tile position, reports progress, and restores the original view when done', async () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.jumpToCalls = []

      const bounds = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }
      const onProgress = vi.fn()
      const controller = new AbortController()

      const result = await instance.downloadArea(bounds, 10, 10, onProgress, controller.signal)

      // One jumpTo per target tile at zoom 10, plus the final restore.
      expect(map.jumpToCalls.length).toBeGreaterThan(1)
      const restoreCall = map.jumpToCalls.at(-1) as { zoom: number }
      expect(restoreCall.zoom).toBe(0) // FakeMap.getZoom() returns 0 — the "original" view
      expect(result.tilesDownloaded).toBe(0) // no real tile fetches happen against FakeMap
    })

    it('stops early when the signal is aborted, without throwing past the caller', async () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      const bounds = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }
      const controller = new AbortController()
      controller.abort()

      await expect(
        instance.downloadArea(bounds, 10, 12, vi.fn(), controller.signal),
      ).rejects.toThrow(/cancelled/i)

      // Aborted before the first tile — no sweep jumps, only the restore.
      expect(map.jumpToCalls).toHaveLength(1)
    })
  })
})
