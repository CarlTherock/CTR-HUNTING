import type { WaypointCategory, WaypointColor } from '@/types'

/** Namespace of the app's own GPX extensions. It is only an identifier (it
 * does not need to resolve); third-party readers ignore unknown extension
 * elements, which is exactly how GPX 1.1 extensions are meant to work. */
export const CTR_NS = 'https://carltherock.github.io/CTR-HUNTING/ns/gpx/1'
export const GPX_NS = 'http://www.topografix.com/GPX/1/1'

/** Import limits, checked BEFORE the XML is parsed or processed. */
export const GPX_MAX_BYTES = 10 * 1024 * 1024
export const GPX_MAX_WAYPOINTS = 10_000
export const GPX_MAX_POINTS = 500_000
export const GPX_MAX_NAME_LENGTH = 200
export const GPX_MAX_TEXT_LENGTH = 10_000

/** Kept next to `categories.ts` (which pulls in React icons) so the GPX code
 * stays free of UI imports; the `Record` type forces every category here. */
export const GPX_SYMBOL: Record<WaypointCategory, string> = {
  general: 'Flag, Blue',
  stand_blind: 'Tree',
  trail_camera: 'Camera',
  food_plot: 'Crossing',
  water: 'Drinking Water',
  bedding_area: 'Lodging',
  game_sign: 'Footprint',
  kill_site: 'Skull and Crossbones Area',
  trailhead: 'Trail Head',
  parking: 'Parking Area',
  campsite: 'Campground',
  hazard: 'Danger Area',
  gate: 'Gate',
  custom: 'Pin, Blue',
}

export const WAYPOINT_CATEGORIES = Object.keys(GPX_SYMBOL) as WaypointCategory[]

export const WAYPOINT_COLORS: readonly WaypointColor[] = [
  '#f59e0b',
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#eab308',
  '#ec4899',
  '#64748b',
]

export function categoryFromSymbol(symbol: string | undefined): WaypointCategory | null {
  if (!symbol) return null
  const match = WAYPOINT_CATEGORIES.find(
    (category) =>
      category !== 'general' &&
      category !== 'custom' &&
      GPX_SYMBOL[category].toLowerCase() === symbol.trim().toLowerCase(),
  )
  return match ?? null
}

/** Ids accepted from an imported file: short and boring, so an id can never
 * smuggle markup or an absurdly long key into the database. */
export const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
