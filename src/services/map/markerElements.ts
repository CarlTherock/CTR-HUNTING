import type { Waypoint, WaypointCategory } from '@/types'

/** Blue dot + white ring, the near-universal "you are here" marker
 * convention — distinct from the round pins waypoints use, so the two are never
 * visually confused on the same map. A direction cone (hidden by default, see
 * `setUserHeadingElement`) is added only when a RELIABLE phone heading exists.
 * Built as a plain DOM element (not JSX) since MapLibre mounts markers outside
 * React. */
export const USER_LOCATION_COLOR = '#2563eb'

export function createUserLocationElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '16px'
  el.style.height = '16px'
  el.style.borderRadius = '50%'
  el.style.background = USER_LOCATION_COLOR
  el.style.border = '2px solid white'
  el.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.35)'
  el.setAttribute('data-testid', 'user-location-marker')
  const cone = document.createElement('div')
  cone.setAttribute('data-testid', 'user-heading-cone')
  cone.style.cssText =
    'display:none;position:absolute;left:50%;bottom:50%;transform:translateX(-50%);width:0;height:0;' +
    'border-left:11px solid transparent;border-right:11px solid transparent;' +
    'border-bottom:26px solid rgba(37,99,235,0.55);pointer-events:none;z-index:-1;'
  el.appendChild(cone)
  return el
}

/** Shows the direction cone of the device marker, or hides it (`null`). */
export function setUserHeadingElement(
  el: HTMLElement,
  trueHeadingDegrees: number | null,
): void {
  const cone = el.querySelector<HTMLElement>('[data-testid="user-heading-cone"]')
  if (!cone) return
  if (trueHeadingDegrees === null) {
    cone.style.display = 'none'
    el.removeAttribute('data-heading')
    return
  }
  cone.style.display = 'block'
  el.setAttribute('data-heading', String(Math.round(trueHeadingDegrees)))
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
  kill_site:
    '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  trailhead:
    '<path d="M12 13v8"/><path d="M12 3v3"/><path d="M2.354 10.354a1.207 1.207 0 0 1 0-1.708l2.06-2.06A2 2 0 0 1 5.828 6h12.344a2 2 0 0 1 1.414.586l2.06 2.06a1.207 1.207 0 0 1 0 1.708l-2.06 2.06a2 2 0 0 1-1.414.586H5.828a2 2 0 0 1-1.414-.586z"/>',
  parking:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  campsite:
    '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
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
export function createWaypointElement(
  waypoint: Waypoint,
  selected = false,
): HTMLDivElement {
  const el = document.createElement('div')
  renderWaypointElement(el, waypoint, selected)
  return el
}

export function renderWaypointElement(
  el: HTMLDivElement,
  waypoint: Waypoint,
  selected = false,
): void {
  const color = waypoint.color ?? DEFAULT_WAYPOINT_COLOR
  const icon = CATEGORY_ICON_INNER[waypoint.category] ?? CATEGORY_ICON_INNER.general
  // The selected waypoint is slightly larger and gets a white + blue double
  // ring (visible on any background). The size grows around the centre
  // (`anchor: 'center'`), so the coordinate never moves.
  const size = selected ? 38 : 30
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.cursor = 'pointer'
  el.style.borderRadius = '50%'
  el.style.background = 'white'
  el.style.border = `3px solid ${color}`
  el.style.boxShadow = selected
    ? `0 0 0 3px white, 0 0 0 6px ${SELECTED_RING_COLOR}, 0 2px 8px rgba(0,0,0,0.6)`
    : '0 1px 4px rgba(0,0,0,0.45)'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  // Keep the selected marker above its neighbours without hiding them.
  el.style.zIndex = selected ? '2' : '1'
  if (selected) el.setAttribute('data-selected', 'true')
  else el.removeAttribute('data-selected')
  el.setAttribute('data-testid', 'waypoint-marker')
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>`
  // Invisible 44 px touch target centred on the marker: the pin looks the
  // same but a fingertip does not have to hit 30 px exactly. Clicks on it
  // bubble to the marker element.
  const hit = document.createElement('span')
  hit.setAttribute('data-hit-area', 'true')
  hit.style.cssText =
    'position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%);border-radius:50%;'
  el.appendChild(hit)
}

/** Ring colour of the selected waypoint (sky blue: not one of the 8 pin colours). */
const SELECTED_RING_COLOR = '#0ea5e9'

/** Preview marker of a point received through a shared link: a sky-blue
 * diamond with a "share" glyph — clearly neither a saved waypoint (round
 * pin), nor the draft (dashed amber ring), nor the GPS dot. Not draggable;
 * the name is set as a text attribute, never as HTML. */
export function createSharedPointElement(name: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '34px'
  el.style.height = '34px'
  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.background = '#0ea5e9'
  el.style.border = '3px solid white'
  el.style.borderRadius = '6px'
  el.style.transform = 'rotate(45deg)'
  el.style.boxShadow = '0 0 0 3px rgba(14,165,233,0.4), 0 2px 8px rgba(0,0,0,0.6)'
  el.setAttribute('data-testid', 'shared-point-marker')
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `Point partagé (aperçu) : ${name}`)
  el.title = `Point partagé (aperçu) : ${name}`
  const dot = document.createElement('span')
  dot.style.cssText =
    'width:8px;height:8px;border-radius:50%;background:white;display:block;'
  el.appendChild(dot)
  return el
}

/** Marker of a waypoint that is not saved yet: a dashed ring, visibly
 * different from saved markers, and the only draggable one. */
export function createDraftElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '34px'
  el.style.height = '34px'
  el.style.cursor = 'grab'
  el.style.borderRadius = '50%'
  el.style.background = 'rgba(255,255,255,0.85)'
  el.style.border = '3px dashed #f59e0b'
  el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.55)'
  el.setAttribute('data-testid', 'draft-waypoint-marker')
  return el
}
