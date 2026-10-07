import type { Coordinate, WeatherFrameKind, WeatherMapFrame, WeatherMapLayerId } from '@/types'

/** MSC GeoMet WMS — verified live 2026-09-25: GetCapabilities advertises
 * `RADAR_1KM_RRAI`/`RADAR_1KM_RSNO` (3 h of real radar, PT6M steps) and
 * the `HRDPS.CONTINENTAL_*` model layers (hourly, ~48 h ahead); GetMap
 * serves EPSG:3857 PNGs with `Access-Control-Allow-Origin: *`;
 * GetFeatureInfo returns the real value at a point as JSON. */
export const GEOMET_WMS_URL = 'https://geo.weather.gc.ca/geomet'
export const GEOMET_HOST = 'geo.weather.gc.ca'

export interface GeoMetLayerDef {
  id: WeatherMapLayerId
  label: string
  kind: WeatherFrameKind
  /** WMS layer names, each drawn as its own stacked raster (radar = rain
   * + snow) — GeoMet does not accept several layers in one GetMap. */
  wmsLayers: string[]
  styles: string[]
  /** Layer whose `time` dimension defines the frames. */
  timeLayer: string
  /** Converts GeoMet's raw GetFeatureInfo value (in the unit its own
   * layer title states) to a display string — `null` when the layer has
   * no point value (pressure contours). */
  formatValue: ((raw: number, wmsLayer: string) => string) | null
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('fr-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits })

export const GEOMET_LAYERS: GeoMetLayerDef[] = [
  {
    id: 'radar',
    label: 'Radar',
    kind: 'observed',
    wmsLayers: ['RADAR_1KM_RRAI', 'RADAR_1KM_RSNO'],
    styles: ['Radar-Rain_Dis-14colors_Fr', 'Radar-Snow_Dis-14colors_Fr'],
    timeLayer: 'RADAR_1KM_RRAI',
    // RRAI title: "precipitation rate for rain [mm/h]"; RSNO: "[cm/h]".
    formatValue: (raw, layer) =>
      layer === 'RADAR_1KM_RSNO' ? `Neige ${fmt(raw, 1)} cm/h` : `Pluie ${fmt(raw, 1)} mm/h`,
  },
  {
    id: 'precipitation',
    label: 'Précip.',
    kind: 'forecast',
    wmsLayers: ['HRDPS.CONTINENTAL.DIAG_PR_PT1H'],
    styles: ['Precip-Accum_0to40mm_Dis'],
    timeLayer: 'HRDPS.CONTINENTAL.DIAG_PR_PT1H',
    // Title: "Precipitation - 1-hour accumulation [mm]".
    formatValue: (raw) => `${fmt(raw, 1)} mm/h`,
  },
  {
    id: 'temperature',
    label: 'Temp.',
    kind: 'forecast',
    wmsLayers: ['HRDPS.CONTINENTAL_TT'],
    styles: ['TEMPERATURE-LINEAR'],
    timeLayer: 'HRDPS.CONTINENTAL_TT',
    formatValue: (raw) => `${fmt(raw, 1)} °C`,
  },
  {
    id: 'wind',
    label: 'Vent',
    kind: 'forecast',
    wmsLayers: ['HRDPS.CONTINENTAL_WSPD'],
    styles: ['WINDSPEEDKMH-LINEAR'],
    timeLayer: 'HRDPS.CONTINENTAL_WSPD',
    // Title: "Wind speed at 10m above surface [m/s]".
    formatValue: (raw) => `${fmt(raw * 3.6)} km/h`,
  },
  {
    id: 'gusts',
    label: 'Rafales',
    kind: 'forecast',
    wmsLayers: ['HRDPS.CONTINENTAL_WGE'],
    styles: ['GUST_MS2KMH-LINEAR'],
    timeLayer: 'HRDPS.CONTINENTAL_WGE',
    // Title: "Wind gust estimate at 10m above surface [m/s]".
    formatValue: (raw) => `${fmt(raw * 3.6)} km/h`,
  },
  {
    id: 'clouds',
    label: 'Nuages',
    kind: 'forecast',
    wmsLayers: ['HRDPS.CONTINENTAL_NT'],
    styles: ['CLOUD'],
    timeLayer: 'HRDPS.CONTINENTAL_NT',
    formatValue: (raw) => `${fmt(raw)} %`,
  },
  {
    id: 'pressure',
    label: 'Pression',
    kind: 'forecast',
    wmsLayers: ['HRDPS.CONTINENTAL_PN'],
    styles: ['SeaLevelPressure_4mb_Color'],
    timeLayer: 'HRDPS.CONTINENTAL_PN',
    formatValue: null,
  },
]

export function layerDef(id: WeatherMapLayerId): GeoMetLayerDef {
  const def = GEOMET_LAYERS.find((l) => l.id === id)
  if (!def) throw new Error(`Couche météo inconnue : ${id}`)
  return def
}

export interface TimeExtent {
  /** Every valid instant, chronological. */
  times: Date[]
}

/** ISO 8601 duration → ms. GeoMet only uses PTnM / PTnH / PnD. */
export function parseIsoDurationMs(duration: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration)
  if (!m) return null
  const [, d, h, min, s] = m.map((v) => (v ? Number(v) : 0))
  const ms = (((d * 24 + h) * 60 + min) * 60 + s) * 1000
  return ms > 0 ? ms : null
}

/** Parses a WMS time dimension value: either `start/end/period` or a
 * comma-separated list of instants. */
export function parseTimeDimension(value: string): Date[] {
  const trimmed = value.trim()
  if (trimmed.includes('/')) {
    const [start, end, period] = trimmed.split('/')
    const step = parseIsoDurationMs(period)
    const startMs = Date.parse(start)
    const endMs = Date.parse(end)
    if (!step || Number.isNaN(startMs) || Number.isNaN(endMs)) return []
    const times: Date[] = []
    for (let t = startMs; t <= endMs && times.length < 2000; t += step) times.push(new Date(t))
    return times
  }
  return trimmed
    .split(',')
    .map((v) => new Date(v.trim()))
    .filter((d) => !Number.isNaN(d.getTime()))
}

/** Pulls the `time` dimension out of a (single-layer) GetCapabilities
 * document. */
export function extractTimeDimension(capabilitiesXml: string): string | null {
  const match = /<Dimension[^>]*name="time"[^>]*>([^<]+)<\/Dimension>/i.exec(capabilitiesXml)
  return match ? match[1] : null
}

export function toIsoSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** Radar: ~3 h at every 2nd 6-min step (12 min) ending on the latest
 * real frame. Forecast: every hour from the current hour up to
 * +48 h, within what the model actually published. */
export function buildFrames(def: GeoMetLayerDef, times: Date[], now: Date): WeatherMapFrame[] {
  if (times.length === 0) return []
  if (def.kind === 'observed') {
    // GeoMet's radar window rolls every 6 min: the oldest advertised
    // instants expire while the user is still watching, and requesting
    // one returns an XML "time outside valid hours" error instead of a
    // PNG. Skip the 3 oldest (18 min of margin, covers the 5-min refresh).
    const usable = times.slice(3)
    const picked: Date[] = []
    for (let i = usable.length - 1; i >= 0 && picked.length < 15; i -= 2) picked.unshift(usable[i])
    return picked.map((t) => ({ time: toIsoSeconds(t), kind: 'observed' }))
  }
  const currentHour = new Date(now)
  currentHour.setUTCMinutes(0, 0, 0)
  const limit = currentHour.getTime() + 48 * 3600_000
  return times
    .filter((t) => t.getTime() >= currentHour.getTime() && t.getTime() <= limit)
    .map((t) => ({ time: toIsoSeconds(t), kind: 'forecast' }))
}

/** One GetMap template per WMS layer of `def`. */
export function geoMetTileUrls(def: GeoMetLayerDef, time: string): string[] {
  return def.wmsLayers.map((layer, i) => geoMetTileUrl(layer, def.styles[i], time))
}

export function geoMetTileUrl(wmsLayer: string, style: string, time: string): string {
  const url = new URL(GEOMET_WMS_URL)
  url.searchParams.set('SERVICE', 'WMS')
  url.searchParams.set('VERSION', '1.3.0')
  url.searchParams.set('REQUEST', 'GetMap')
  url.searchParams.set('LAYERS', wmsLayer)
  url.searchParams.set('STYLES', style)
  url.searchParams.set('CRS', 'EPSG:3857')
  url.searchParams.set('WIDTH', '256')
  url.searchParams.set('HEIGHT', '256')
  url.searchParams.set('FORMAT', 'image/png')
  url.searchParams.set('TRANSPARENT', 'TRUE')
  url.searchParams.set('TIME', time)
  // Unencoded, last — MapLibre substitutes this exact token per tile
  // (same technique as `forestLayerTiles.ts`).
  return `${url.toString()}&BBOX={bbox-epsg-3857}`
}

export function geoMetLegendUrl(def: GeoMetLayerDef, index = 0): string {
  const url = new URL(GEOMET_WMS_URL)
  url.searchParams.set('SERVICE', 'WMS')
  url.searchParams.set('VERSION', '1.3.0')
  url.searchParams.set('REQUEST', 'GetLegendGraphic')
  url.searchParams.set('LAYER', def.wmsLayers[index])
  url.searchParams.set('STYLE', def.styles[index])
  url.searchParams.set('FORMAT', 'image/png')
  url.searchParams.set('SLD_VERSION', '1.1.0')
  url.searchParams.set('LANG', 'fr')
  return url.toString()
}

interface FeatureInfoResponse {
  features?: { properties?: { value?: number | null } }[]
}

export class GeoMetProvider {
  async fetchFrames(def: GeoMetLayerDef, now = new Date()): Promise<WeatherMapFrame[]> {
    const url = new URL(GEOMET_WMS_URL)
    url.searchParams.set('SERVICE', 'WMS')
    url.searchParams.set('VERSION', '1.3.0')
    url.searchParams.set('REQUEST', 'GetCapabilities')
    url.searchParams.set('LAYER', def.timeLayer)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`GeoMet a répondu ${response.status}`)
    const xml = await response.text()
    const dimension = extractTimeDimension(xml)
    if (!dimension) throw new Error('Aucune période disponible pour cette couche')
    const frames = buildFrames(def, parseTimeDimension(dimension), now)
    if (frames.length === 0) throw new Error('Aucune image disponible pour cette période')
    return frames
  }

  /** Real value at `coordinate` for the frame's time — `null` when
   * GeoMet has no feature there (e.g. no radar echo, outside the model
   * domain), never a guessed 0. For multi-layer frames (radar) returns
   * the first layer with a positive value. */
  async fetchValueAt(
    def: GeoMetLayerDef,
    time: string,
    coordinate: Coordinate,
  ): Promise<string | null> {
    if (!def.formatValue) return null
    const d = 0.01
    for (const layer of def.wmsLayers) {
      const url = new URL(GEOMET_WMS_URL)
      url.searchParams.set('SERVICE', 'WMS')
      url.searchParams.set('VERSION', '1.3.0')
      url.searchParams.set('REQUEST', 'GetFeatureInfo')
      url.searchParams.set('LAYERS', layer)
      url.searchParams.set('QUERY_LAYERS', layer)
      url.searchParams.set('CRS', 'EPSG:4326')
      // WMS 1.3.0 + EPSG:4326 = lat,lng axis order.
      url.searchParams.set(
        'BBOX',
        `${coordinate.lat - d},${coordinate.lng - d},${coordinate.lat + d},${coordinate.lng + d}`,
      )
      url.searchParams.set('WIDTH', '3')
      url.searchParams.set('HEIGHT', '3')
      url.searchParams.set('I', '1')
      url.searchParams.set('J', '1')
      url.searchParams.set('INFO_FORMAT', 'application/json')
      url.searchParams.set('TIME', time)
      const response = await fetch(url)
      if (!response.ok) continue
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('json')) continue
      const data = (await response.json()) as FeatureInfoResponse
      const raw = data.features?.[0]?.properties?.value
      if (typeof raw !== 'number' || Number.isNaN(raw)) continue
      if (def.kind === 'observed' && raw <= 0) continue
      return def.formatValue(raw, layer)
    }
    return null
  }
}
