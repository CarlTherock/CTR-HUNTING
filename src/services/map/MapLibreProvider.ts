import type { GeoJSONSource } from 'maplibre-gl'
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type {
  AnalysisHeatmapCell,
  Coordinate,
  MapBaseLayerId,
  MapOverlayId,
  MapViewState,
  WeatherMapLayer,
  WeatherTileFrame,
  Waypoint,
  WaypointCategory,
  WindField,
} from '@/types'
import { analysisHeatmapColor } from '@/utils/analysisHeatmapColors'
import { tileCenterLngLat, tileRangeForBounds, tilesForRange } from '@/utils/tiles'
import type { LngLatBounds } from '@/utils/tiles'
import { weatherLayerColor, valueForLayer } from '@/utils/weatherMapColors'
import { advancePosition, windAt } from '@/utils/windField'
import type { CreateMapOptions, DownloadAreaProgress, MapInstance, MapProvider } from './MapProvider'
import {
  ensureOfflineProtocolsRegistered,
  setActiveDownload,
  transformMapRequest,
} from './offlineProtocols'

/** Real vector layer IDs inside MapTiler's "Outdoor" style, grouped by
 * overlay. MapTiler doesn't expose trails/hydrography/contours as
 * separate style URLs, so toggling them means hiding/showing layers that
 * already exist in this one style — extracted from the style's own
 * `style.json` (`layers[].id`), not invented. No other base layer
 * (MapTiler "Satellite", either Esri style) has these layers;
 * `setOverlayVisible` no-ops there. */
const OVERLAY_LAYER_IDS: Record<MapOverlayId, string[]> = {
  contours: ['contour_index', 'contour', 'contour_label'],
  hydrography: [
    'water',
    'water_intermittent',
    'waterway_tunnel',
    'waterway_river',
    'waterway_river_intermittent',
    'waterway_other',
    'waterway_other_intermittent',
    'water_name_line',
    'water_name_point',
    'water_name_way',
    'outdoor_poi_waterfall',
    'outdoor_poi_drinking_water',
  ],
  trails: [
    'tunnel_road_path',
    'road_path_casing',
    'road_path',
    'road_label_track',
    'trail_longdistance_casing',
    'trail_longdistance',
    ...(
      ['yellow', 'green', 'blue', 'brown', 'black', 'purple', 'orange', 'red'] as const
    ).flatMap((color) => [
      `trail_${color}_casing`,
      `trail_${color}_casing_extra`,
      `trail_${color}`,
      `trail_${color}_extra`,
    ]),
  ],
}

/** Applies one overlay's visibility to whichever of its layers actually
 * exist in the currently-loaded style — silently does nothing for layers
 * that aren't there (e.g. any overlay against a non-"Outdoor" style). */
function applyOverlay(map: MapLibreMap, overlay: MapOverlayId, visible: boolean): void {
  for (const layerId of OVERLAY_LAYER_IDS[overlay]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }
}

/** Small blue dot + white ring, the near-universal "you are here" marker
 * convention — distinct from the teardrop pins waypoints use (Phase 2), so
 * the two are never visually confused on the same map. Built as a plain
 * DOM element (not JSX) since MapLibre mounts markers outside React. */
function createUserLocationElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '16px'
  el.style.height = '16px'
  el.style.borderRadius = '50%'
  el.style.background = '#22c55e'
  el.style.border = '2px solid white'
  el.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.35)'
  return el
}

const DEFAULT_WAYPOINT_COLOR = '#f59e0b'

/** Inner SVG markup (stroke-based, matches lucide's icon style) for each
 * waypoint category — copied from the same lucide-react icons
 * `WaypointEditPanel`'s category picker uses, so the picker and the
 * actual map marker never show two different symbols for one category.
 * Plain strings, not React/lucide components: markers are DOM elements
 * MapLibre mounts outside React, and this file must stay framework
 * agnostic (only `maplibre-gl` may be imported here). */
const CATEGORY_ICON_INNER: Record<WaypointCategory, string> = {
  general:
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  stand_blind:
    '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z"/><path d="M12 22v-3"/>',
  trail_camera:
    '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
  food_plot:
    '<path d="M2 22 16 8"/><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z"/><path d="M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z"/><path d="M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M15.47 13.47 17 15l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/><path d="M19.47 9.47 21 11l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L13 11l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z"/>',
  water:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  bedding_area:
    '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  game_sign:
    '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/>',
  kill_site: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trailhead:
    '<path d="M12 13v8"/><path d="M12 3v3"/><path d="M2.354 10.354a1.207 1.207 0 0 1 0-1.708l2.06-2.06A2 2 0 0 1 5.828 6h12.344a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H5.828a2 2 0 0 1-1.414-.586z"/>',
  parking:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  campsite: '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  hazard:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  gate: '<path d="M11 20H2"/><path d="M11 4.562v16.157a1 1 0 0 0 1.242.97L19 20V5.562a2 2 0 0 0-1.515-1.94l-4-1A2 2 0 0 0 11 4.561z"/><path d="M11 4H8a2 2 0 0 0-2 2v14"/><path d="M14 12h.01"/><path d="M22 20h-3"/>',
  custom:
    '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
}

/** White circle, colored ring, black category icon — a clean, modern
 * pin style distinct from the round green "you are here" dot, so the two
 * are never confused when both are on screen. `anchor: 'center'` (a
 * plain circle, not a teardrop) since the ring color already draws the
 * eye to the exact point. */
function createWaypointElement(waypoint: Waypoint): HTMLDivElement {
  const el = document.createElement('div')
  renderWaypointElement(el, waypoint)
  return el
}

function renderWaypointElement(el: HTMLDivElement, waypoint: Waypoint): void {
  const color = waypoint.color ?? DEFAULT_WAYPOINT_COLOR
  const icon = CATEGORY_ICON_INNER[waypoint.category] ?? CATEGORY_ICON_INNER.general
  el.style.width = '30px'
  el.style.height = '30px'
  el.style.cursor = 'pointer'
  el.style.borderRadius = '50%'
  el.style.background = 'white'
  el.style.border = `3px solid ${color}`
  el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.45)'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`
}

const TRACK_PREVIEW_SOURCE_ID = 'track-preview'
const TRACK_PREVIEW_LAYER_ID = 'track-preview-line'

/** Terrain DEM source (Phase 4). AWS's public "Terrarium" elevation
 * tiles — real, verified, no API key required (registry.opendata.aws/
 * terrain-tiles/). Deliberately not MapTiler's `terrain-rgb-v2`: its
 * RGB-decoding convention (Mapbox-compatible vs. something else) isn't
 * documented anywhere this session could verify, and this project's
 * hard rule is to never guess a technical fact like that — Terrarium's
 * encoding is unambiguous and MapLibre supports it natively
 * (`encoding: 'terrarium'`). Terrain is independent of the active base
 * layer/vendor (it's a separate draped mesh, not part of the visual
 * style), so this works the same under any base layer. */
const TERRAIN_SOURCE_ID = 'terrain-dem'
const TERRAIN_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


/** A LineString needs at least 2 positions to be valid GeoJSON — fewer
 * than that (recording just started, or not recording) renders as an
 * empty FeatureCollection instead of an invalid geometry. */
function trackPreviewGeoJson(points: Coordinate[] | null) {
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

const MEASURE_SOURCE_ID = 'measure-path'
const MEASURE_LINE_LAYER_ID = 'measure-path-line'
const MEASURE_POINT_LAYER_ID = 'measure-path-points'

/** One Point feature per tapped point (so each is visible as soon as
 * it's placed) plus one LineString feature once there are 2+ (so the
 * connecting path shows regardless of how many points end up in it). */
function measurePathGeoJson(points: Coordinate[] | null) {
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
  return { type: 'FeatureCollection' as const, features: [...lineFeatures, ...pointFeatures] }
}

interface WindParticle {
  pos: Coordinate
  age: number
}

const WIND_PARTICLE_COUNT = 400
/** Frames before a particle respawns elsewhere — keeps trails short and
 * the field feeling continuously "alive" rather than a few long streaks. */
const WIND_PARTICLE_MAX_AGE = 100
/** Stylized animation-speed multiplier — see `advancePosition`'s own doc
 * comment (`utils/windField.ts`) for why real-world wind speed would be
 * imperceptible frame-to-frame on a map. */
const WIND_SPEED_SCALE = 60

function randomPointInBounds(map: MapLibreMap): Coordinate {
  const bounds = map.getBounds()
  return {
    lat: bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth()),
    lng: bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()),
  }
}

/** Draws a smooth color-graded overlay for a non-wind layer (temperature/
 * precipitation/clouds) — Windy's signature calibrated-color-scale map,
 * confirmed live at windy.com/colors. Each real grid sample gets a soft
 * radial blob (never a fabricated interpolated grid — just visually
 * blended real values), sized to roughly cover the gap between samples
 * so the field reads as continuous rather than as isolated dots. */
function drawWeatherOverlay(
  ctx: CanvasRenderingContext2D,
  map: MapLibreMap,
  field: WindField,
  hourOffset: number,
  layer: Exclude<WeatherMapLayer, 'wind'>,
  width: number,
  height: number,
) {
  const sampleCount = field.samples.length
  if (sampleCount === 0) return
  const radius = Math.max(60, (Math.min(width, height) / Math.sqrt(sampleCount)) * 0.95)

  for (const sample of field.samples) {
    const reading = sample.hourly[hourOffset]
    if (!reading) continue
    const value = valueForLayer(layer, reading)
    const screen = map.project([sample.coordinate.lng, sample.coordinate.lat])
    const gradient = ctx.createRadialGradient(screen.x, screen.y, 0, screen.x, screen.y, radius)
    gradient.addColorStop(0, weatherLayerColor(layer, value, 0.55))
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

/**
 * Owns a `<canvas>` overlaid on the map container and a
 * `requestAnimationFrame` loop drawing the active Windy-style weather
 * layer on it (Phase 6) — a plain 2D canvas, not a MapLibre GeoJSON
 * layer, since both the particle trails and the pan/zoom-reactive color
 * overlay need per-frame screen-space redraws a style layer isn't suited
 * for. `map.project()` reprojects every point every frame, so pan/zoom/
 * rotate need no extra bookkeeping to stay correct. Every value drawn —
 * particle vectors or overlay colors — comes from the *nearest real grid
 * sample* (`utils/windField.ts`'s `windAt`) — never interpolated/
 * fabricated between samples.
 */
function createWindLayer(map: MapLibreMap, container: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  container.appendChild(canvas)

  let field: WindField | null = null
  let hourOffset = 0
  let layer: WeatherMapLayer = 'wind'
  let particles: WindParticle[] = []
  let animationFrame: number | null = null
  let trailsNeedClear = true
  const onMove = () => {
    trailsNeedClear = true
  }
  map.on('move', onMove)

  function reset() {
    particles = Array.from({ length: WIND_PARTICLE_COUNT }, () => ({
      pos: randomPointInBounds(map),
      age: Math.floor(Math.random() * WIND_PARTICLE_MAX_AGE),
    }))
  }

  function step() {
    if (!field) return
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (layer !== 'wind') {
      ctx.clearRect(0, 0, width, height)
      drawWeatherOverlay(ctx, map, field, hourOffset, layer, width, height)
      animationFrame = requestAnimationFrame(step)
      return
    }

    // Fading trails (Windy/earth.nullschool style): instead of wiping
    // the canvas every frame, the previous frame is faded a little so
    // each particle leaves a short tail. Cleared outright whenever the
    // camera moves (see the `move` listener) so trails never smear
    // across a pan.
    if (trailsNeedClear) {
      ctx.clearRect(0, 0, width, height)
      trailsNeedClear = false
    } else {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.lineWidth = 1.8
    ctx.lineCap = 'round'
    // Constant on-screen speed whatever the zoom: a fixed geographic step
    // is invisible zoomed out (~1 km/px at z7) and too fast zoomed in.
    const zoomSpeedScale = WIND_SPEED_SCALE * Math.pow(2, 14 - map.getZoom())

    for (const particle of particles) {
      const screenStart = map.project([particle.pos.lng, particle.pos.lat])
      const wind = windAt(field, particle.pos, hourOffset)
      if (wind) {
        const nextPos = advancePosition(particle.pos, wind, 1 / 60, zoomSpeedScale)
        const screenEnd = map.project([nextPos.lng, nextPos.lat])
        // Colored by local speed — Windy's own convention (blue calm →
        // red gale) — so the flow field reads at a glance, not just from
        // trail motion alone.
        ctx.strokeStyle = weatherLayerColor('wind', wind.speedKmh, 0.85)
        ctx.beginPath()
        ctx.moveTo(screenStart.x, screenStart.y)
        ctx.lineTo(screenEnd.x, screenEnd.y)
        ctx.stroke()
        particle.pos = nextPos
        particle.age += 1
      } else {
        particle.age = WIND_PARTICLE_MAX_AGE + 1
      }
      const offScreen =
        screenStart.x < -20 ||
        screenStart.x > width + 20 ||
        screenStart.y < -20 ||
        screenStart.y > height + 20
      if (particle.age > WIND_PARTICLE_MAX_AGE || offScreen) {
        particle.pos = randomPointInBounds(map)
        particle.age = 0
      }
    }

    animationFrame = requestAnimationFrame(step)
  }

  return {
    setField(newField: WindField | null, newHourOffset: number, newLayer: WeatherMapLayer) {
      field = newField
      hourOffset = newHourOffset
      layer = newLayer
      if (field && animationFrame === null) {
        reset()
        animationFrame = requestAnimationFrame(step)
      } else if (!field && animationFrame !== null) {
        cancelAnimationFrame(animationFrame)
        animationFrame = null
        const ctx = canvas.getContext('2d')
        ctx?.clearRect(0, 0, canvas.width, canvas.height)
      }
    },
    destroy() {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      map.off('move', onMove)
      canvas.remove()
    },
  }
}

/** `rgba(r, g, b, a)` → numeric channels (alpha scaled to 0-255). */
function parseRgba(color: string): [number, number, number, number] {
  const m = /rgba?\(([^)]+)\)/.exec(color)
  if (!m) return [0, 0, 0, 0]
  const [r, g, b, a = '1'] = m[1].split(',').map((v) => v.trim())
  return [Number(r), Number(g), Number(b), Math.round(Number(a) * 255)]
}

interface HeatmapGrid {
  lngs: number[]
  lats: number[] // north → south
  /** Offscreen canvas, one pixel per real cell (transparent = no score). */
  image: HTMLCanvasElement
  cellLng: number
  cellLat: number
}

/** Rebuilds the regular grid the cells came from (`utils/grid.ts`'s
 * `buildGrid` — evenly spaced lat/lng) as a tiny image, one pixel per
 * real cell. Upscaled with bilinear smoothing when drawn, which blends
 * *between* real cell centers for a continuous surface — each pixel
 * center still sits exactly on its real cell's value. */
function buildHeatmapGrid(cells: AnalysisHeatmapCell[]): HeatmapGrid | null {
  const round = (v: number) => Math.round(v * 1e6) / 1e6
  const lngs = [...new Set(cells.map((c) => round(c.coordinate.lng)))].sort((a, b) => a - b)
  const lats = [...new Set(cells.map((c) => round(c.coordinate.lat)))].sort((a, b) => b - a)
  if (lngs.length === 0 || lats.length === 0) return null
  const image = document.createElement('canvas')
  image.width = lngs.length
  image.height = lats.length
  const ctx = image.getContext('2d')
  if (!ctx) return null
  const data = ctx.createImageData(lngs.length, lats.length)
  for (const cell of cells) {
    if (cell.combined.overallScore === null) continue
    const x = lngs.indexOf(round(cell.coordinate.lng))
    const y = lats.indexOf(round(cell.coordinate.lat))
    if (x < 0 || y < 0) continue
    const [r, g, b, a] = parseRgba(analysisHeatmapColor(cell.combined.overallScore, 0.5))
    const i = (y * lngs.length + x) * 4
    data.data[i] = r
    data.data[i + 1] = g
    data.data[i + 2] = b
    data.data[i + 3] = a
  }
  ctx.putImageData(data, 0, 0)
  const cellLng = lngs.length > 1 ? (lngs[lngs.length - 1] - lngs[0]) / (lngs.length - 1) : 0.01
  const cellLat = lats.length > 1 ? (lats[0] - lats[lats.length - 1]) / (lats.length - 1) : 0.01
  return { lngs, lats, image, cellLng, cellLat }
}

/**
 * Owns a separate `<canvas>` (independent of `createWindLayer`'s) drawing
 * the analysis heatmap as a continuous color surface over the analyzed
 * area — no more isolated radial blobs. Redrawn only when the camera
 * moves (`render` event), never in a continuous animation loop, so an
 * idle map costs no battery.
 */
function createAnalysisHeatmapLayer(map: MapLibreMap, container: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'absolute'
  canvas.style.inset = '0'
  canvas.style.pointerEvents = 'none'
  container.appendChild(canvas)

  let grid: HeatmapGrid | null = null
  let listening = false

  function draw() {
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!grid) return

    const { lngs, lats, image, cellLng, cellLat } = grid
    const west = lngs[0] - cellLng / 2
    const east = lngs[lngs.length - 1] + cellLng / 2
    const north = lats[0] + cellLat / 2
    const south = lats[lats.length - 1] - cellLat / 2

    const flat = Math.abs(map.getBearing()) < 0.5 && map.getPitch() < 1
    if (flat) {
      const topLeft = map.project([west, north])
      const bottomRight = map.project([east, south])
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
      return
    }
    // Rotated / tilted: one projected quad per real cell (no smoothing
    // across a non-affine projection — still the real values).
    const pixels = image.getContext('2d')?.getImageData(0, 0, image.width, image.height).data
    if (!pixels) return
    for (let y = 0; y < lats.length; y++) {
      for (let x = 0; x < lngs.length; x++) {
        const i = (y * lngs.length + x) * 4
        if (pixels[i + 3] === 0) continue
        const w = lngs[x] - cellLng / 2
        const e = lngs[x] + cellLng / 2
        const n = lats[y] + cellLat / 2
        const s = lats[y] - cellLat / 2
        const corners = [map.project([w, n]), map.project([e, n]), map.project([e, s]), map.project([w, s])]
        ctx.fillStyle = `rgba(${pixels[i]}, ${pixels[i + 1]}, ${pixels[i + 2]}, ${pixels[i + 3] / 255})`
        ctx.beginPath()
        ctx.moveTo(corners[0].x, corners[0].y)
        for (const c of corners.slice(1)) ctx.lineTo(c.x, c.y)
        ctx.closePath()
        ctx.fill()
      }
    }
  }

  return {
    setCells(newCells: AnalysisHeatmapCell[] | null) {
      grid = newCells && newCells.length > 0 ? buildHeatmapGrid(newCells) : null
      if (grid && !listening) {
        map.on('render', draw)
        map.on('resize', draw)
        listening = true
      } else if (!grid && listening) {
        map.off('render', draw)
        map.off('resize', draw)
        listening = false
      }
      draw()
    },
    destroy() {
      map.off('render', draw)
      map.off('resize', draw)
      canvas.remove()
    },
  }
}

/** Resolves once the map has finished loading everything it currently
 * needs (`'idle'`) — or after `timeoutMs`, so a download sweep can never
 * hang forever on a tile that silently never settles. */
function waitForIdle(map: MapLibreMap, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    map.once('idle', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

export interface MapLibreProviderApiKeys {
  /** MapTiler ("outdoor", "satellite"). Get one at
   * https://cloud.maptiler.com/account/keys/ */
  mapTiler?: string
  /** Esri (every "esri-*" base layer) — an ArcGIS Location Platform API
   * key scoped to the "Basemaps" privilege only. Get one at
   * https://developers.arcgis.com. */
  esri?: string
}

/** Esri Basemap Styles v2 style name for each "esri-*" base layer —
 * https://developers.arcgis.com/rest/basemap-styles/. Picked for what the
 * roadmap actually needs, not "every style Esri has": topographic/imagery
 * mirror MapTiler as an alternate vendor; terrain + hillshade give relief
 * context ahead of Phase 4's real 3D terrain; light-gray/dark-gray are the
 * standard neutral canvases Phase 8–9's analytics heatmaps get drawn on;
 * navigation is road-focused for finding access routes. */
const ESRI_STYLE_NAME: Record<Exclude<MapBaseLayerId, 'outdoor' | 'satellite'>, string> = {
  'esri-topographic': 'topographic',
  'esri-imagery': 'imagery',
  'esri-imagery-standard': 'imagery/standard',
  'esri-terrain': 'terrain',
  'esri-hillshade': 'hillshade/light',
  'esri-light-gray': 'light-gray',
  'esri-dark-gray': 'dark-gray',
  'esri-navigation': 'navigation',
}

/**
 * MapLibre GL JS, configured with whichever base-layer vendor(s) have a
 * key. Both MapTiler and Esri's Basemap Styles v2 service serve
 * MapLibre-compatible style JSON, so one engine instance covers both —
 * `setBaseLayer` is always just a style-URL swap regardless of vendor.
 * This is the only file in the app allowed to import `maplibre-gl`
 * directly — everything else depends on `MapProvider`.
 */
export class MapLibreProvider implements MapProvider {
  private readonly apiKeys: MapLibreProviderApiKeys

  constructor(apiKeys: MapLibreProviderApiKeys) {
    this.apiKeys = apiKeys
  }

  private styleUrl(layer: MapBaseLayerId): string {
    switch (layer) {
      case 'outdoor':
        return `https://api.maptiler.com/maps/outdoor/style.json?key=${this.apiKeys.mapTiler}`
      case 'satellite':
        return `https://api.maptiler.com/maps/satellite/style.json?key=${this.apiKeys.mapTiler}`
      default:
        return `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/${ESRI_STYLE_NAME[layer]}?token=${this.apiKeys.esri}`
    }
  }

  createMap({
    container,
    initialView,
    initialBaseLayer,
    initialOverlays,
    onViewChange,
    onMapClick,
    onWaypointClick,
    onWaypointDragEnd,
  }: CreateMapOptions): MapInstance {
    // MapLibre resolves its worker script at runtime rather than via a
    // static `new URL(..., import.meta.url)` Rollup/Vite can detect and
    // bundle automatically, so it silently 404s unless we point it there
    // ourselves. `vite.config.ts` copies the worker (and the sibling chunk
    // it imports) to `maplibre/` in the output, unhashed, under
    // `BASE_URL` — matching where they're actually served, in dev and in
    // the GitHub Pages build. Called here (not at module scope) so an app
    // with no configured provider never pays for maplibre-gl at all — see
    // `services/map/index.ts`.
    setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`)
    ensureOfflineProtocolsRegistered()

    const map = new MapLibreMap({
      container,
      style: this.styleUrl(initialBaseLayer),
      center: [initialView.center.lng, initialView.center.lat],
      zoom: initialView.zoom,
      pitch: initialView.pitch,
      bearing: initialView.bearing,
      transformRequest: transformMapRequest,
      // MapLibre's own default maxPitch is 60° — a moderate tilt, not
      // close enough to the horizon to feel like standing at eye level
      // looking at terrain ahead. 85° is the ceiling MapLibre's own docs
      // describe for the initial `pitch` option (0–85); going further
      // toward 90 is what their docs flag as "experimental" and prone to
      // rendering issues, so 85 is the real, supported maximum, not an
      // arbitrary guess.
      maxPitch: 85,
    })

    map.addControl(new NavigationControl(), 'top-right')
    const windLayer = createWindLayer(map, container)
    const analysisHeatmapLayer = createAnalysisHeatmapLayer(map, container)

    // Re-applied on every style load — including the first one, and every
    // subsequent setStyle() from setBaseLayer, which discards all prior
    // per-layer visibility since it's a fresh style parse.
    const overlayState: Record<MapOverlayId, boolean> = { ...initialOverlays }
    let trackPreviewPoints: Coordinate[] | null = null
    let measurePathPoints: Coordinate[] | null = null
    // Terrain is now *always* kept set on the map (never `null`), even in
    // "2D" mode — confirmed directly in MapLibre's own type definitions:
    // `queryTerrainElevation` "Returns null if terrain is not enabled."
    // Before this fix, every elevation query (terrain info, elevation
    // profile, and every Phase 8/9 analyzer/heatmap cell) silently
    // returned null whenever the user wasn't in 3D view — the actual
    // cause of "Terrain: No data" always showing. In 2D, exaggeration is
    // simply held at 1 (true scale) rather than nulling terrain
    // entirely — with pitch 0 (looking straight down), real-scale
    // terrain displacement isn't visually different from no terrain at
    // all, so 2D still looks flat.
    let terrainExaggeration = 1
    // Named external raster overlays (radar, Forêt ouverte's cadastre/
    // coupes/peuplements, …) — re-applied on every style load same as
    // terrain, since a base-layer switch's setStyle() discards custom
    // sources/layers. Keyed by the caller's own `id` so any number of
    // these can be active simultaneously without clobbering each other.
    const rasterOverlays = new Map<string, { tileUrlTemplate: string; opacity: number }>()
    function rasterSourceId(id: string) {
      return `raster-overlay-${id}`
    }
    function rasterLayerId(id: string) {
      return `raster-overlay-${id}-layer`
    }
    function applyRasterOverlay(id: string) {
      const sourceId = rasterSourceId(id)
      const layerId = rasterLayerId(id)
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId)
        map.removeSource(sourceId)
      }
      const overlay = rasterOverlays.get(id)
      if (overlay) {
        map.addSource(sourceId, {
          type: 'raster',
          tiles: [overlay.tileUrlTemplate],
          tileSize: 256,
        })
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': overlay.opacity },
        })
      }
    }
    function applyAllRasterOverlays() {
      for (const id of rasterOverlays.keys()) applyRasterOverlay(id)
    }

    // Animated weather frames (radar / HRDPS forecast). One raster
    // source+layer per frame, all at opacity 0 except the active one, so
    // swapping frames is a paint-property change (no flicker, no
    // re-request). Only a small window around the active frame is kept
    // on the map — enough to preload what playback shows next without
    // requesting 48 hours of imagery at once.
    let weatherFrames: WeatherTileFrame[] = []
    let weatherActiveIndex = 0
    let weatherOpacity = 0.75
    const WEATHER_PREFIX = 'wx-frame-'
    /** Frames currently on the map — cleared on every style load, since
     * setStyle() discards custom sources/layers. */
    const addedWeatherKeys = new Set<string>()
    const WEATHER_WINDOW_BEHIND = 1
    const WEATHER_WINDOW_AHEAD = 3
    /** Sub-layer count per frame (radar = rain + snow). */
    const weatherPartCounts = new Map<string, number>()
    function weatherSourceId(key: string, part: number) {
      return `${WEATHER_PREFIX}${key}-${part}`
    }
    function weatherLayerId(key: string, part: number) {
      return `${WEATHER_PREFIX}${key}-${part}-layer`
    }
    function wantedWeatherKeys(): Set<string> {
      const wanted = new Set<string>()
      const n = weatherFrames.length
      if (n === 0) return wanted
      for (let d = -WEATHER_WINDOW_BEHIND; d <= WEATHER_WINDOW_AHEAD; d++) {
        wanted.add(weatherFrames[(((weatherActiveIndex + d) % n) + n) % n].key)
      }
      return wanted
    }
    function syncWeatherFrames() {
      const wanted = wantedWeatherKeys()
      const activeKey = weatherFrames[weatherActiveIndex]?.key
      for (const key of [...addedWeatherKeys]) {
        if (wanted.has(key)) continue
        for (let i = 0; i < (weatherPartCounts.get(key) ?? 1); i++) {
          if (map.getLayer(weatherLayerId(key, i))) map.removeLayer(weatherLayerId(key, i))
          if (map.getSource(weatherSourceId(key, i))) map.removeSource(weatherSourceId(key, i))
        }
        addedWeatherKeys.delete(key)
        weatherPartCounts.delete(key)
      }
      if (wanted.size === 0) return
      // Draw weather under the GPS track / measurement lines.
      const beforeId = map.getLayer(TRACK_PREVIEW_LAYER_ID) ? TRACK_PREVIEW_LAYER_ID : undefined
      for (const frame of weatherFrames) {
        if (!wanted.has(frame.key)) continue
        const opacity = frame.key === activeKey ? weatherOpacity : 0
        const parts = frame.tileUrlTemplates.length
        if (addedWeatherKeys.has(frame.key)) {
          for (let i = 0; i < parts; i++) {
            map.setPaintProperty(weatherLayerId(frame.key, i), 'raster-opacity', opacity)
          }
          continue
        }
        frame.tileUrlTemplates.forEach((template, i) => {
          map.addSource(weatherSourceId(frame.key, i), {
            type: 'raster',
            tiles: [template],
            tileSize: 256,
            attribution: 'Environnement et Changement climatique Canada (MSC GeoMet)',
          })
          map.addLayer(
            {
              id: weatherLayerId(frame.key, i),
              type: 'raster',
              source: weatherSourceId(frame.key, i),
              paint: {
                'raster-opacity': opacity,
                'raster-fade-duration': 0,
                'raster-resampling': 'linear',
              },
            },
            beforeId,
          )
        })
        weatherPartCounts.set(frame.key, parts)
        addedWeatherKeys.add(frame.key)
      }
    }
    map.on('style.load', () => {
      for (const overlay of Object.keys(overlayState) as MapOverlayId[]) {
        applyOverlay(map, overlay, overlayState[overlay])
      }
      // setStyle() (base layer switch) discards custom sources/layers too
      // — re-add the track preview source/layer every time, seeded with
      // whatever's currently being recorded (or nothing).
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
      // Elevation-profile measurement (Phase 4) — its own source/layers,
      // separate from the track preview above, so drawing a measurement
      // never interferes with an in-progress GPS track (or vice versa).
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
      // Same reasoning as the track preview source — re-added on every
      // style load so a base layer switch never silently drops terrain.
      map.addSource(TERRAIN_SOURCE_ID, {
        type: 'raster-dem',
        tiles: [TERRAIN_TILE_URL],
        tileSize: 256,
        encoding: 'terrarium',
        maxzoom: 15,
      })
      // Always set (see the doc comment above `terrainExaggeration`) —
      // not conditional on a "3D mode" flag.
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: terrainExaggeration })
      applyAllRasterOverlays()
      addedWeatherKeys.clear()
      weatherPartCounts.clear()
      syncWeatherFrames()
    })

    if (onViewChange) {
      map.on('moveend', () => {
        const center = map.getCenter()
        onViewChange({
          center: { lat: center.lat, lng: center.lng },
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        })
      })
    }

    if (onMapClick) {
      map.on('click', (e) => {
        onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      })
    }

    let userMarker: Marker | null = null
    const waypointMarkers = new Map<string, Marker>()

    return {
      setView(view: Partial<MapViewState>) {
        if (view.center) map.setCenter([view.center.lng, view.center.lat])
        if (view.zoom !== undefined) map.setZoom(view.zoom)
        if (view.pitch !== undefined) map.setPitch(view.pitch)
        if (view.bearing !== undefined) map.setBearing(view.bearing)
      },
      setBaseLayer: (layer: MapBaseLayerId) => {
        map.setStyle(this.styleUrl(layer))
      },
      setOverlayVisible(overlay: MapOverlayId, visible: boolean) {
        overlayState[overlay] = visible
        applyOverlay(map, overlay, visible)
      },
      setUserLocationMarker(coordinate: Coordinate | null) {
        if (!coordinate) {
          userMarker?.remove()
          userMarker = null
          return
        }
        if (!userMarker) {
          // Marker.addTo() immediately positions itself from `_lngLat`, so
          // it must be set *before* adding — adding first crashes reading
          // `.lng` off the not-yet-set position (only masked in dev/test
          // because there, no fix ever arrives and this branch never ran).
          userMarker = new Marker({ element: createUserLocationElement() }).setLngLat([
            coordinate.lng,
            coordinate.lat,
          ])
          userMarker.addTo(map)
        } else {
          userMarker.setLngLat([coordinate.lng, coordinate.lat])
        }
      },
      setWaypoints(waypoints: Waypoint[]) {
        const seen = new Set<string>()
        for (const waypoint of waypoints) {
          seen.add(waypoint.id)
          const existing = waypointMarkers.get(waypoint.id)
          if (existing) {
            existing.setLngLat([waypoint.coordinate.lng, waypoint.coordinate.lat])
            // Cheap to re-apply unconditionally (no diffing category/color
            // individually) — this only runs when the waypoint list
            // itself changed, not on every render.
            renderWaypointElement(existing.getElement() as HTMLDivElement, waypoint)
            continue
          }
          const el = createWaypointElement(waypoint)
          el.addEventListener('click', (e) => {
            e.stopPropagation()
            onWaypointClick?.(waypoint.id)
          })
          const marker = new Marker({ element: el, anchor: 'center', draggable: true })
            .setLngLat([waypoint.coordinate.lng, waypoint.coordinate.lat])
            .addTo(map)
          if (onWaypointDragEnd) {
            marker.on('dragend', () => {
              const lngLat = marker.getLngLat()
              onWaypointDragEnd(waypoint.id, { lat: lngLat.lat, lng: lngLat.lng })
            })
          }
          waypointMarkers.set(waypoint.id, marker)
        }
        for (const [id, marker] of waypointMarkers) {
          if (!seen.has(id)) {
            marker.remove()
            waypointMarkers.delete(id)
          }
        }
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
      setWindField(field: WindField | null, hourOffset: number, layer: WeatherMapLayer) {
        windLayer.setField(field, hourOffset, layer)
      },
      setAnalysisHeatmap(cells: AnalysisHeatmapCell[] | null) {
        analysisHeatmapLayer.setCells(cells)
      },
      setWeatherFrames(frames: WeatherTileFrame[] | null, activeIndex: number, opacity: number) {
        weatherFrames = frames ?? []
        weatherActiveIndex = Math.max(0, Math.min(weatherFrames.length - 1, activeIndex))
        weatherOpacity = opacity
        try {
          syncWeatherFrames()
        } catch {
          // Style not ready yet (mount, or mid base-layer switch) — the
          // `style.load` handler re-applies the current frames.
        }
      },
      isWeatherFrameReady(key: string): boolean {
        const parts = weatherPartCounts.get(key)
        if (!parts || !addedWeatherKeys.has(key)) return false
        for (let i = 0; i < parts; i++) {
          const id = weatherSourceId(key, i)
          if (!map.getSource(id) || !map.isSourceLoaded(id)) return false
        }
        return true
      },
      setRasterOverlay(id: string, tileUrlTemplate: string | null, opacity: number) {
        if (tileUrlTemplate) {
          rasterOverlays.set(id, { tileUrlTemplate, opacity })
        } else {
          rasterOverlays.delete(id)
        }
        applyRasterOverlay(id)
      },
      setTerrainEnabled(enabled: boolean, exaggeration: number) {
        // Terrain itself stays set either way (see the doc comment on
        // `terrainExaggeration`'s declaration) — "2D" now means "real
        // scale, not visually exaggerated," not "no terrain at all."
        terrainExaggeration = enabled ? exaggeration : 1
        map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: terrainExaggeration })
      },
      queryElevation(coordinate: Coordinate): number | null {
        const raw = map.queryTerrainElevation([coordinate.lng, coordinate.lat])
        if (raw === null) return null
        // MapLibre's own docs: "If terrain is enabled with some
        // exaggeration value, the value returned here will be
        // reflective of (multiplied by) that exaggeration value" — undo
        // that scaling so callers always get the real elevation,
        // regardless of the visual exaggeration currently active.
        return raw / terrainExaggeration
      },
      getBounds(): LngLatBounds {
        const bounds = map.getBounds()
        return {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        }
      },
      async downloadArea(
        bounds: LngLatBounds,
        minZoom: number,
        maxZoom: number,
        onProgress: (progress: DownloadAreaProgress) => void,
        signal: AbortSignal,
      ): Promise<DownloadAreaProgress> {
        const savedView = {
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        }
        const tileUrls = new Set<string>()
        let bytesDownloaded = 0
        setActiveDownload({
          tileUrls,
          bytesDownloaded: 0,
          onProgress: (progress) => {
            bytesDownloaded = progress.bytesDownloaded
            onProgress(progress)
          },
        })

        try {
          for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
            const range = tileRangeForBounds(bounds, zoom)
            for (const tile of tilesForRange(range)) {
              if (signal.aborted) {
                throw new DOMException('Offline area download cancelled', 'AbortError')
              }
              const center = tileCenterLngLat(tile.x, tile.y, zoom)
              map.jumpTo({ center: [center.lng, center.lat], zoom })
              await waitForIdle(map)
            }
          }
          return { tilesDownloaded: tileUrls.size, bytesDownloaded, tileUrls: [...tileUrls] }
        } finally {
          setActiveDownload(null)
          map.jumpTo(savedView)
        }
      },
      destroy() {
        userMarker?.remove()
        for (const marker of waypointMarkers.values()) marker.remove()
        windLayer.destroy()
        analysisHeatmapLayer.destroy()
        map.remove()
      },
    }
  }
}
