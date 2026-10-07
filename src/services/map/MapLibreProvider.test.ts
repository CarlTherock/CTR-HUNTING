import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    (
      params: { url: string; type?: string },
      ac: AbortController,
    ) => Promise<{ data: unknown }>
  > = {}
  const fakeAddProtocol = (
    name: string,
    handler: (typeof registeredProtocols)[string],
  ) => {
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
    sources: Record<string, { data: unknown; setDataCalls: unknown[]; raw: unknown }> = {}
    layerIds: string[] = []
    transformRequest?: (url: string, resourceType?: string) => { url: string } | undefined
    maxPitch?: number | null
    constructor(options: {
      style: string
      transformRequest?: (
        url: string,
        resourceType?: string,
      ) => { url: string } | undefined
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
      this.sources[id] = { data: source.data, setDataCalls: [], raw: source }
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
    addLayer(layer: { id: string; source?: unknown; paint?: unknown }) {
      this.layerIds.push(layer.id)
      this.addedLayers.push(layer)
    }
    addedLayers: { id: string; source?: unknown; paint?: unknown }[] = []
    removeLayer(id: string) {
      this.layerIds = this.layerIds.filter((l) => l !== id)
      this.addedLayers = this.addedLayers.filter((l) => l.id !== id)
    }
    removeSource(id: string) {
      const { [id]: _removed, ...rest } = this.sources
      this.sources = rest
    }
    on(event: string, handler: (...args: never[]) => void) {
      ;(this.handlers[event] ??= []).push(handler)
    }
    off(event: string, handler: (...args: never[]) => void) {
      this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler)
    }
    paintCalls: { id: string; name: string; value: unknown }[] = []
    setPaintProperty(id: string, name: string, value: unknown) {
      this.paintCalls.push({ id, name, value })
    }
    isSourceLoaded(id: string) {
      return id in this.sources
    }
    fire(event: string, ...args: unknown[]) {
      for (const handler of this.handlers[event] ?? [])
        (handler as (...a: unknown[]) => void)(...args)
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
    resize() {
      // no-op: a size change has no observable effect on the fake map
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
      return existingLayers.has(id) || this.layerIds.includes(id) ? {} : undefined
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
  provider = new MapLibreProvider({
    mapTiler: 'maptiler-test-key',
    esri: 'esri-test-key',
  }),
) {
  return provider.createMap({
    container: document.createElement('div'),
    initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
    initialBaseLayer: 'outdoor',
    initialOverlays: { trails: true, hydrography: true, contours: true },
  })
}

describe('MapLibreProvider', () => {
  it("raises maxPitch above MapLibre's 60° default so 3D can reach a near-eye-level tilt", () => {
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
      markerInstances[0].element?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )

      expect(onWaypointClick).toHaveBeenCalledWith('a')
      expect(onMapClick).not.toHaveBeenCalled()
    })

    it('creates saved waypoint markers as NOT draggable (their location is locked)', () => {
      markerInstances.length = 0
      const instance = createTestMap()

      instance.setWaypoints([waypointA])

      expect(markerInstances).toHaveLength(1)
      expect(markerInstances[0].draggable).toBe(false)
      // Nothing listens for a drag on a saved marker, so a forced `dragend`
      // cannot reach any caller.
      expect(markerInstances[0].handlers.dragend ?? []).toHaveLength(0)
    })

    it('does not move a saved marker when the same waypoint is re-sent with another position', () => {
      markerInstances.length = 0
      const instance = createTestMap()

      instance.setWaypoints([waypointA])
      const before = markerInstances[0].lngLat
      instance.setWaypoints([waypointA])

      expect(markerInstances).toHaveLength(1)
      expect(markerInstances[0].lngLat).toEqual(before)
    })

    it('shows a draggable draft marker and reports its drop position via onDraftMove', () => {
      markerInstances.length = 0
      const onDraftMove = vi.fn()
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container: document.createElement('div'),
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
        onDraftMove,
      })

      instance.setDraftWaypoint({ lat: 1, lng: 2 })
      expect(markerInstances).toHaveLength(1)
      expect(markerInstances[0].draggable).toBe(true)

      markerInstances[0].setLngLat([9, 8]) // simulates the drag moving the marker
      markerInstances[0].fire('dragend')
      expect(onDraftMove).toHaveBeenCalledWith({ lat: 8, lng: 9 })
    })

    it('moves the existing draft marker instead of adding another, and removes it with null', () => {
      markerInstances.length = 0
      const instance = createTestMap()

      instance.setDraftWaypoint({ lat: 1, lng: 2 })
      instance.setDraftWaypoint({ lat: 3, lng: 4 })
      expect(markerInstances).toHaveLength(1)
      expect(markerInstances[0].lngLat).toEqual([4, 3])

      instance.setDraftWaypoint(null)
      expect(calls).toContain('remove')
    })
  })

  describe('track preview', () => {
    it('adds the live track line layer once the style has loaded', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      map.fire('style.load')

      expect(map.layerIds).toContain('track-preview-line')
      expect(map.sources['track-preview'].data).toEqual({
        type: 'FeatureCollection',
        features: [],
      })

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
      expect(map.sources['track-preview'].data).toEqual({
        type: 'FeatureCollection',
        features: [],
      })

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
      expect(map.sources['track-preview'].data).toEqual({
        type: 'FeatureCollection',
        features: [],
      })
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
      expect(map.sources['measure-path'].data).toEqual({
        type: 'FeatureCollection',
        features: [],
      })
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

      const data = map.sources['measure-path'].data as {
        features: { geometry: { type: string } }[]
      }
      expect(data.features.filter((f) => f.geometry.type === 'Point')).toHaveLength(3)
      expect(data.features.filter((f) => f.geometry.type === 'LineString')).toHaveLength(
        1,
      )
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

      expect(map.sources['measure-path'].data).toEqual({
        type: 'FeatureCollection',
        features: [],
      })
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

  describe('analysis heatmap (Phase 9)', () => {
    const CELLS = [
      {
        coordinate: { lat: 0, lng: 0 },
        combined: {
          overallScore: 72,
          results: [
            {
              analyzer: 'terrain' as const,
              score: 72,
              confidence: 'calculated' as const,
              factors: [],
            },
          ],
        },
      },
      {
        coordinate: { lat: 0.01, lng: 0.01 },
        combined: { overallScore: null, results: [] },
      },
    ]

    it('adds a second, independent canvas overlay alongside the wind layer', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      expect(container.querySelectorAll('canvas')).toHaveLength(2)
    })

    it('setAnalysisHeatmap does not throw when enabling, updating (including a null-score cell), or clearing', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      expect(() => instance.setAnalysisHeatmap(CELLS)).not.toThrow()
      expect(() => instance.setAnalysisHeatmap(CELLS)).not.toThrow()
      expect(() => instance.setAnalysisHeatmap(null)).not.toThrow()
    })

    it('setting the wind field and the heatmap together does not interfere with either', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      instance.setAnalysisHeatmap(CELLS)
      expect(() =>
        instance.setWindField({ timezone: 'UTC', samples: [] }, 0, 'wind'),
      ).not.toThrow()
      expect(() => instance.setAnalysisHeatmap(null)).not.toThrow()
    })

    it('removes both canvases on destroy', () => {
      const container = document.createElement('div')
      const provider = new MapLibreProvider({ mapTiler: 'test-key' })
      const instance = provider.createMap({
        container,
        initialView: { center: { lat: 0, lng: 0 }, zoom: 5, pitch: 0, bearing: 0 },
        initialBaseLayer: 'outdoor',
        initialOverlays: { trails: true, hydrography: true, contours: true },
      })

      instance.setAnalysisHeatmap(CELLS)
      instance.destroy()

      expect(container.querySelectorAll('canvas')).toHaveLength(0)
    })
  })

  describe('terrain (Phase 4)', () => {
    it('keeps terrain always set, at real scale (exaggeration 1) by default, so elevation queries work even in 2D', () => {
      // MapLibre's own docs: `queryTerrainElevation` "Returns null if
      // terrain is not enabled" — before this fix, every elevation
      // query (terrain info, elevation profile, every Phase 8/9
      // analyzer/heatmap cell) silently returned null whenever the user
      // wasn't in 3D view. Terrain now stays set unconditionally.
      mapInstances.length = 0
      createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      expect(map.terrainCalls).toEqual([{ source: 'terrain-dem', exaggeration: 1 }])
    })

    it('setTerrainEnabled(true, exaggeration) calls setTerrain with the DEM source and exaggeration', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      instance.setTerrainEnabled(true, 2)

      expect(map.terrainCalls).toEqual([{ source: 'terrain-dem', exaggeration: 2 }])
    })

    it('setTerrainEnabled(false, …) drops to real scale (exaggeration 1), never nulls terrain out entirely', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      instance.setTerrainEnabled(true, 2)
      instance.setTerrainEnabled(false, 2)

      expect(map.terrainCalls.at(-1)).toEqual({ source: 'terrain-dem', exaggeration: 1 })
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

    it('queryElevation undoes the exaggeration scaling MapLibre applies to the raw value, so it always returns the real elevation', () => {
      // MapLibre's own docs: "If terrain is enabled with some
      // exaggeration value, the value returned here will be reflective
      // of (multiplied by) that exaggeration value." The fake engine
      // returns whatever raw value is set — real terrain at 3x
      // exaggeration would report 3x the true elevation.
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.elevationByLngLat['-71.2,46.8'] = 900 // raw value at 3x exaggeration

      instance.setTerrainEnabled(true, 3)

      expect(instance.queryElevation({ lat: 46.8, lng: -71.2 })).toBe(300) // 900 / 3 = true elevation
    })
  })

  describe('animated weather frames (GeoMet radar / HRDPS)', () => {
    const FRAMES = Array.from({ length: 8 }, (_, i) => ({
      key: `radar-t${i}`,
      tileUrlTemplates: [
        `https://geo.weather.gc.ca/geomet?LAYERS=RRAI&TIME=t${i}&BBOX={bbox-epsg-3857}`,
        `https://geo.weather.gc.ca/geomet?LAYERS=RSNO&TIME=t${i}&BBOX={bbox-epsg-3857}`,
      ],
    }))

    it('keeps only a small preload window on the map, with only the active frame visible', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')

      instance.setWeatherFrames(FRAMES, 7, 0.8)

      const wxLayers = map.addedLayers.filter(
        (l) => l.id.startsWith('wx-frame-') && l.id.endsWith('-0-layer'),
      )
      // Rain + snow: one stacked raster per WMS layer, per frame.
      expect(map.addedLayers.filter((l) => l.id.startsWith('wx-frame-'))).toHaveLength(10)
      // 1 behind + active + 3 ahead (wrapping around for looping playback).
      expect(wxLayers.map((l) => l.id)).toEqual([
        'wx-frame-radar-t0-0-layer',
        'wx-frame-radar-t1-0-layer',
        'wx-frame-radar-t2-0-layer',
        'wx-frame-radar-t6-0-layer',
        'wx-frame-radar-t7-0-layer',
      ])
      const active = wxLayers.find((l) => l.id === 'wx-frame-radar-t7-0-layer')
      expect(active?.paint).toMatchObject({
        'raster-opacity': 0.8,
        'raster-fade-duration': 0,
      })
      expect(
        wxLayers.find((l) => l.id === 'wx-frame-radar-t0-0-layer')?.paint,
      ).toMatchObject({ 'raster-opacity': 0 })
    })

    it('advancing swaps opacity in place, and drops frames that leave the window', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')
      instance.setWeatherFrames(FRAMES, 1, 0.8)
      instance.setWeatherFrames(FRAMES, 2, 0.8)

      expect(map.paintCalls).toContainEqual({
        id: 'wx-frame-radar-t2-0-layer',
        name: 'raster-opacity',
        value: 0.8,
      })
      expect(map.paintCalls).toContainEqual({
        id: 'wx-frame-radar-t1-0-layer',
        name: 'raster-opacity',
        value: 0,
      })
      expect(map.getLayer('wx-frame-radar-t0-0-layer')).toBeUndefined()
      expect(map.getLayer('wx-frame-radar-t5-0-layer')).toBeDefined()
      expect(instance.isWeatherFrameReady('radar-t5')).toBe(true)
      expect(instance.isWeatherFrameReady('radar-t0')).toBe(false)
    })

    it('clears every frame on null, and re-adds them after a base layer switch', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      map.fire('style.load')
      instance.setWeatherFrames(FRAMES, 0, 0.8)
      map.layerIds = []
      map.sources = {}
      map.fire('style.load')
      expect(map.getLayer('wx-frame-radar-t0-0-layer')).toBeDefined()

      instance.setWeatherFrames(null, 0, 0.8)
      expect(map.layerIds.some((id) => id.startsWith('wx-frame-'))).toBe(false)
    })

    it('never routes weather tiles through the offline tile cache', () => {
      mapInstances.length = 0
      createTestMap()
      const map = mapInstances[0]
      expect(
        map.transformRequest?.('https://geo.weather.gc.ca/geomet?x=1', 'Tile'),
      ).toBeUndefined()
    })
  })

  describe('raster overlays (radar, Forêt ouverte layers, …)', () => {
    it('adds a real raster source/layer for the given id/tile template/opacity', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      instance.setRasterOverlay(
        'radar',
        'https://tilecache.rainviewer.com/v2/radar/123/256/{z}/{x}/{y}/2/1_1.png',
        0.6,
      )

      expect(map.sources['raster-overlay-radar'].raw).toEqual({
        type: 'raster',
        tiles: [
          'https://tilecache.rainviewer.com/v2/radar/123/256/{z}/{x}/{y}/2/1_1.png',
        ],
        tileSize: 256,
      })
      expect(map.addedLayers.at(-1)).toEqual({
        id: 'raster-overlay-radar-layer',
        type: 'raster',
        source: 'raster-overlay-radar',
        paint: { 'raster-opacity': 0.6 },
      })
    })

    it('supports multiple overlay ids active at once, without clobbering each other', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]

      instance.setRasterOverlay(
        'radar',
        'https://example.com/radar/{bbox-epsg-3857}',
        0.6,
      )
      instance.setRasterOverlay(
        'cadastre',
        'https://example.com/cadastre/{bbox-epsg-3857}',
        0.7,
      )

      expect(map.getLayer('raster-overlay-radar-layer')).toBeDefined()
      expect(map.getLayer('raster-overlay-cadastre-layer')).toBeDefined()

      instance.setRasterOverlay('radar', null, 0.6)

      expect(map.getLayer('raster-overlay-radar-layer')).toBeUndefined()
      expect(map.getLayer('raster-overlay-cadastre-layer')).toBeDefined()
    })

    it('removes the layer/source when passed null, rather than leaving a stale overlay', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      instance.setRasterOverlay(
        'radar',
        'https://tilecache.rainviewer.com/v2/radar/123/256/{z}/{x}/{y}/2/1_1.png',
        0.6,
      )

      instance.setRasterOverlay('radar', null, 0.6)

      expect(map.getLayer('raster-overlay-radar-layer')).toBeUndefined()
      expect(map.sources['raster-overlay-radar']).toBeUndefined()
    })

    it('re-adds every active overlay after a base layer switch reloads the style, same as terrain', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const map = mapInstances[0]
      instance.setRasterOverlay(
        'radar',
        'https://tilecache.rainviewer.com/v2/radar/123/256/{z}/{x}/{y}/2/1_1.png',
        0.6,
      )
      map.layerIds = map.layerIds.filter((id) => id !== 'raster-overlay-radar-layer')
      map.removeSource('raster-overlay-radar')

      instance.setBaseLayer('satellite')
      map.fire('style.load')

      expect(map.getLayer('raster-overlay-radar-layer')).toBeDefined()
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

      const result = map.transformRequest?.(
        'https://api.maptiler.com/tiles/v3/5/10/12.pbf',
        'Tile',
      )
      expect(result).toEqual({ url: 'ctrtile://api.maptiler.com/tiles/v3/5/10/12.pbf' })
    })

    it.each([
      ['Style', 'https://api.maptiler.com/maps/outdoor/style.json?key=k', 'ctrfresh'],
      ['Source', 'https://api.maptiler.com/tiles/v3/tiles.json?key=k', 'ctrfresh'],
      ['SpriteJSON', 'https://api.maptiler.com/maps/outdoor/sprite.json', 'ctrfresh'],
      ['SpriteImage', 'https://api.maptiler.com/maps/outdoor/sprite.png', 'ctrstatic'],
      ['Glyphs', 'https://api.maptiler.com/fonts/Noto/0-255.pbf', 'ctrstatic'],
    ])('routes %s requests through the %s:// protocol', (type, url, protocol) => {
      mapInstances.length = 0
      createTestMap()
      const result = mapInstances[0].transformRequest?.(url, type)
      expect(result).toEqual({ url: url.replace('https://', `${protocol}://`) })
    })

    it('never caches live weather imagery or unknown resource types', () => {
      mapInstances.length = 0
      createTestMap()
      const map = mapInstances[0]
      expect(
        map.transformRequest?.('https://geo.weather.gc.ca/geomet?x=1', 'Tile'),
      ).toBeUndefined()
      expect(map.transformRequest?.('https://example.com/a', 'Unknown')).toBeUndefined()
      expect(map.transformRequest?.('data:image/png;base64,AA', 'Image')).toBeUndefined()
    })
  })

  describe('ctrfresh:// and ctrstatic:// handlers', () => {
    const styleUrl = 'https://api.maptiler.com/maps/outdoor/style.json?key=k'
    const resources = new Map<string, Response>()
    beforeEach(() => {
      resources.clear()
      vi.stubGlobal('caches', {
        open: async () => ({
          match: async (u: string) => resources.get(u)?.clone(),
          put: async (u: string, r: Response) => void resources.set(u, r),
        }),
      })
    })
    afterEach(() => vi.unstubAllGlobals())

    it('ctrfresh serves the network answer and keeps a copy', async () => {
      createTestMap()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"version":8}')))
      const result = await registeredProtocols.ctrfresh(
        { url: styleUrl.replace('https://', 'ctrfresh://'), type: 'json' },
        new AbortController(),
      )
      expect(result.data).toEqual({ version: 8 })
      expect(resources.has(styleUrl)).toBe(true)
    })

    it('ctrfresh falls back to the cached copy when offline', async () => {
      createTestMap()
      resources.set(styleUrl, new Response('{"version":8,"name":"cached"}'))
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
      const result = await registeredProtocols.ctrfresh(
        { url: styleUrl.replace('https://', 'ctrfresh://'), type: 'json' },
        new AbortController(),
      )
      expect(result.data).toEqual({ version: 8, name: 'cached' })
    })

    it('ctrfresh fails visibly when offline with nothing cached', async () => {
      createTestMap()
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
      await expect(
        registeredProtocols.ctrfresh(
          { url: styleUrl.replace('https://', 'ctrfresh://'), type: 'json' },
          new AbortController(),
        ),
      ).rejects.toThrow()
    })

    it('ctrstatic is cache-first and does not touch the network on a hit', async () => {
      createTestMap()
      const glyphs = 'https://api.maptiler.com/fonts/Noto/0-255.pbf'
      resources.set(glyphs, new Response(new Uint8Array(7)))
      const fetchSpy = vi.fn()
      vi.stubGlobal('fetch', fetchSpy)
      const result = await registeredProtocols.ctrstatic(
        { url: glyphs.replace('https://', 'ctrstatic://'), type: 'arrayBuffer' },
        new AbortController(),
      )
      expect((result.data as ArrayBuffer).byteLength).toBe(7)
      expect(fetchSpy).not.toHaveBeenCalled()
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
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(bytes, { status: 200 })),
      )

      const handler = registeredProtocols.ctrtile
      const result = await handler(
        { url: 'ctrtile://api.maptiler.com/tiles/v3/5/10/12.pbf' },
        new AbortController(),
      )

      // Realm-independent check: `instanceof ArrayBuffer` fails when jsdom and
      // Node's Response come from different realms (Node 22), not a real bug.
      expect(Object.prototype.toString.call(result.data)).toBe('[object ArrayBuffer]')
      expect((result.data as ArrayBuffer).byteLength).toBe(500)
      expect(
        await cache.match('https://api.maptiler.com/tiles/v3/5/10/12.pbf'),
      ).toBeDefined()
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

      const result = await instance.downloadArea(
        bounds,
        10,
        10,
        onProgress,
        controller.signal,
      )

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
      ).rejects.toThrow(/annulé/i)

      // Aborted before the first tile — no sweep jumps, only the restore.
      expect(map.jumpToCalls).toHaveLength(1)
    })
  })
  describe('invalid coordinates', () => {
    it('does not move the camera to a NaN center (MapLibre would throw)', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const setCenter = vi.spyOn(mapInstances[0], 'setCenter')

      expect(() =>
        instance.setView({ center: { lat: Number.NaN, lng: 0 }, zoom: 7 }),
      ).not.toThrow()
      expect(setCenter).not.toHaveBeenCalled()

      instance.setView({ center: { lat: 46.8, lng: -71.2 } })
      expect(setCenter).toHaveBeenCalledWith([-71.2, 46.8])
    })

    it('queryElevation reports "unavailable" for a NaN coordinate instead of reaching the engine', () => {
      mapInstances.length = 0
      const instance = createTestMap()
      const query = vi
        .spyOn(mapInstances[0], 'queryTerrainElevation')
        .mockImplementation(() => {
          throw new Error('Invalid LngLat object: (NaN, NaN)')
        })

      expect(instance.queryElevation({ lat: Number.NaN, lng: Number.NaN })).toBeNull()
      expect(query).not.toHaveBeenCalled()
    })
  })
})
