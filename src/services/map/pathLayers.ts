import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Coordinate } from '@/types'
import type { MeasureShape } from './MapProvider'

export const TRACK_PREVIEW_SOURCE_ID = 'track-preview'
export const TRACK_PREVIEW_LAYER_ID = 'track-preview-line'

export const GUIDANCE_SOURCE_ID = 'guidance-line'
export const GUIDANCE_CASING_LAYER_ID = 'guidance-line-casing'
export const GUIDANCE_LAYER_ID = 'guidance-line'
/** Fuchsia: not the track preview (blue), the measure path (amber) nor any
 * waypoint colour, so a guidance line is never mistaken for a track. */
export const GUIDANCE_LINE_COLOR = '#d946ef'

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

/** The straight "as the crow flies" line of "Aller à": two endpoints or
 * nothing. It is a transient drawing, never a track. */
export function guidanceLineGeoJson(line: readonly [Coordinate, Coordinate] | null) {
  return {
    type: 'FeatureCollection' as const,
    features: line
      ? [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: line.map((p) => [p.lng, p.lat]),
            },
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

/** Teal: distinct from the elevation-profile path (amber), the track
 * preview (blue) and the guidance line (fuchsia). */
export const MEASURE_SHAPE_COLOR = '#14b8a6'
export const MEASURE_SHAPE_SOURCE_ID = 'measure-shape'
export const MEASURE_SHAPE_FILL_LAYER_ID = 'measure-shape-fill'
export const MEASURE_SHAPE_LINE_LAYER_ID = 'measure-shape-line'
export const MEASURE_SHAPE_POINT_LAYER_ID = 'measure-shape-points'

/** Polygon fill (closed, 3+ points), outline LineString (open: through the
 * points; closed: back to the first one) and one Point per vertex. Fewer
 * points than a geometry needs simply yield fewer features, never an invalid
 * geometry. */
export function measureShapeGeoJson(shape: MeasureShape | null) {
  const points = shape?.points ?? []
  const ring = points.map((p) => [p.lng, p.lat])
  const closed = Boolean(shape?.closed)
  const features: {
    type: 'Feature'
    properties: Record<string, never>
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'LineString'; coordinates: number[][] }
      | { type: 'Point'; coordinates: number[] }
  }[] = []
  if (closed && points.length >= 3) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    })
  }
  if (points.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: closed && points.length >= 3 ? [...ring, ring[0]] : ring,
      },
    })
  }
  for (const coordinates of ring) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates },
    })
  }
  return { type: 'FeatureCollection' as const, features }
}

/** Owns the GeoJSON line/point overlays drawn above the base style — the
 * live GPS track preview, the elevation-profile measurement path (Phase 4)
 * and the dashed "Aller à" guidance line, each with its own source/layers so drawing a measurement
 * never interferes with an in-progress GPS track (or vice versa). The last
 * points are remembered so `addToStyle` can re-seed them after a base
 * layer switch (`setStyle()` discards all custom sources/layers). */
export function createPathLayers(map: MapLibreMap) {
  let trackPreviewPoints: Coordinate[] | null = null
  let measurePathPoints: Coordinate[] | null = null
  let guidanceLine: readonly [Coordinate, Coordinate] | null = null
  let measureShape: MeasureShape | null = null

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
      map.addSource(MEASURE_SHAPE_SOURCE_ID, {
        type: 'geojson',
        data: measureShapeGeoJson(measureShape),
      })
      map.addLayer({
        id: MEASURE_SHAPE_FILL_LAYER_ID,
        type: 'fill',
        source: MEASURE_SHAPE_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': MEASURE_SHAPE_COLOR, 'fill-opacity': 0.25 },
      })
      map.addLayer({
        id: MEASURE_SHAPE_LINE_LAYER_ID,
        type: 'line',
        source: MEASURE_SHAPE_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': MEASURE_SHAPE_COLOR, 'line-width': 3 },
      })
      map.addLayer({
        id: MEASURE_SHAPE_POINT_LAYER_ID,
        type: 'circle',
        source: MEASURE_SHAPE_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': MEASURE_SHAPE_COLOR,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addSource(GUIDANCE_SOURCE_ID, {
        type: 'geojson',
        data: guidanceLineGeoJson(guidanceLine),
      })
      map.addLayer({
        id: GUIDANCE_CASING_LAYER_ID,
        type: 'line',
        source: GUIDANCE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.8 },
      })
      map.addLayer({
        id: GUIDANCE_LAYER_ID,
        type: 'line',
        source: GUIDANCE_SOURCE_ID,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': GUIDANCE_LINE_COLOR,
          'line-width': 3,
          'line-dasharray': [2, 2],
        },
      })
    },
    setTrackPreview(points: Coordinate[] | null) {
      trackPreviewPoints = points
      const source = map.getSource(TRACK_PREVIEW_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(trackPreviewGeoJson(points))
    },
    setGuidanceLine(line: readonly [Coordinate, Coordinate] | null) {
      guidanceLine = line
      const source = map.getSource(GUIDANCE_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(guidanceLineGeoJson(line))
    },
    setMeasureShape(shape: MeasureShape | null) {
      measureShape = shape
      const source = map.getSource(MEASURE_SHAPE_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(measureShapeGeoJson(shape))
    },
    setMeasurePath(points: Coordinate[] | null) {
      measurePathPoints = points
      const source = map.getSource(MEASURE_SOURCE_ID) as GeoJSONSource | undefined
      source?.setData(measurePathGeoJson(points))
    },
  }
}
