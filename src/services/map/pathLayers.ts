import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Coordinate } from '@/types'

export const TRACK_PREVIEW_SOURCE_ID = 'track-preview'
export const TRACK_PREVIEW_LAYER_ID = 'track-preview-line'

const MEASURE_SOURCE_ID = 'measure-path'
const MEASURE_LINE_LAYER_ID = 'measure-path-line'
const MEASURE_POINT_LAYER_ID = 'measure-path-points'

/** A LineString needs at least 2 positions to be valid GeoJSON — fewer
 * than that (recording just started, or not recording) renders as an
 * empty FeatureCollection instead of an invalid geometry. */
export function trackPreviewGeoJson(points: Coordinate[] | null) {
  const coordinates = (points ?? []).map((p) => [p.lng, p.lat])
  return {
    type: 'FeatureCollection' as const,
    features:
      coordinates.length >= 2
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates },
            },
          ]
        : [],
  }
}

/** One Point feature per tapped point (so each is visible as soon as
 * it's placed) plus one LineString feature once there are 2+ (so the
 * connecting path shows regardless of how many points end up in it). */
export function measurePathGeoJson(points: Coordinate[] | null) {
  const pts = points ?? []
  const pointFeatures = pts.map((p) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  }))
  const lineFeatures =
    pts.length >= 2
      ? [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: pts.map((p) => [p.lng, p.lat]),
            },
          },
        ]
      : []
  return {
    type: 'FeatureCollection' as const,
    features: [...lineFeatures, ...pointFeatures],
  }
}

/** Owns the two GeoJSON line/point overlays drawn above the base style —
 * the live GPS track preview and the elevation-profile measurement path
 * (Phase 4), each with its own source/layers so drawing a measurement
 * never interferes with an in-progress GPS track (or vice versa). The last
 * points are remembered so `addToStyle` can re-seed them after a base
 * layer switch (`setStyle()` discards all custom sources/layers). */
export function createPathLayers(map: MapLibreMap) {
  let trackPreviewPoints: Coordinate[] | null = null
  let measurePathPoints: Coordinate[] | null = null

  return {
    /** Call on every `style.load`. */
    addToStyle() {
      map.addSource(TRACK_PREVIEW_SOURCE_ID, {
        type: 'geojson',
        data: trackPreviewGeoJson(trackPreviewPoints),
      })
      map.addLayer({
        id: TRACK_PREVIEW_LAYER_ID,
        type: 'line',
        source: TRACK_PREVIEW_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#3b82f6', 'line-width': 4 },
      })
      map.addSource(MEASURE_SOURCE_ID, {
        type: 'geojson',
        data: measurePathGeoJson(measurePathPoints),
      })
      map.addLayer({
        id: MEASURE_LINE_LAYER_ID,
        type: 'line',
        source: MEASURE_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [2, 1] },
      })
      map.addLayer({
        id: MEASURE_POINT_LAYER_ID,
        type: 'circle',
        source: MEASURE_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': '#f59e0b',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
    },
    setTrackPreview(points: Coordinate[] | null) {
      trackPreviewPoints = points
      const source = map.getSource(TRACK_PREVIEW_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(trackPreviewGeoJson(points))
    },
    setMeasurePath(points: Coordinate[] | null) {
      measurePathPoints = points
      const source = map.getSource(MEASURE_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(measurePathGeoJson(points))
    },
  }
}
