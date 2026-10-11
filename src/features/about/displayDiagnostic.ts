import { APP_BUILD_DATE, APP_VERSION } from '@/app/appInfo'

/**
 * Read-only « diagnostic d'affichage » (À propos). It only reads sizes and
 * display modes from the browser — no GPS, no position, no identifier, no
 * key, no waypoint — and nothing is sent anywhere: the user copies the text
 * themselves.
 */

export interface RectInfo {
  x: number
  y: number
  width: number
  height: number
  bottom: number
}

export interface MapDisplaySnapshot {
  takenAt: number
  immersive: boolean
  container: RectInfo | null
  canvas: RectInfo | null
}

export interface DisplayDiagnostic {
  appVersion: string
  buildIso: string
  buildLocal: string
  timeZone: string
  utcOffset: string
  innerWidth: number
  innerHeight: number
  screenWidth: number
  screenHeight: number
  devicePixelRatio: number
  clientHeight: number
  visualViewport: {
    width: number
    height: number
    offsetTop: number
    offsetLeft: number
    scale: number
  } | null
  safeArea: { top: number; right: number; bottom: number; left: number }
  orientation: string
  displayMode: 'standalone (installée)' | 'navigateur (Safari ou autre)'
  navigatorStandalone: boolean | null
  rects: {
    shell: RectInfo | null
    main: RectInfo | null
    navigation: RectInfo | null
  }
  map: MapDisplaySnapshot | null
}

let lastMap: MapDisplaySnapshot | null = null

export function rectOf(element: Element | null): RectInfo | null {
  if (!element) return null
  const r = element.getBoundingClientRect()
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
    bottom: Math.round(r.bottom),
  }
}

/** Called by the map page: the map is not mounted on À propos itself. */
export function recordMapDisplay(
  container: Element | null,
  canvas: Element | null,
  immersive: boolean,
  now = Date.now(),
): void {
  if (!container) return
  lastMap = {
    takenAt: now,
    immersive,
    container: rectOf(container),
    canvas: rectOf(canvas),
  }
}

export function lastMapDisplay(): MapDisplaySnapshot | null {
  return lastMap
}

export function resetMapDisplayForTests(): void {
  lastMap = null
}

/** UTC offset of `date` in the viewer's zone, e.g. « UTC-04:00 ». */
export function utcOffsetLabel(date: Date): string {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  return `UTC${sign}${hh}:${mm}`
}

/** Full local date and time of the build, with its zone — never a bare date. */
export function formatBuildMoment(iso: string): {
  local: string
  zone: string
  offset: string
} {
  const date = new Date(iso)
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'inconnu'
  if (Number.isNaN(date.getTime())) return { local: 'inconnue', zone, offset: '' }
  const local = new Intl.DateTimeFormat('fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date)
  return { local, zone, offset: utcOffsetLabel(date) }
}

/** Reads the real safe-area insets by measuring an invisible probe. */
export function measureSafeArea(doc: Document): DisplayDiagnostic['safeArea'] {
  const probe = doc.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:0;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
  doc.body.appendChild(probe)
  const style = doc.defaultView?.getComputedStyle(probe)
  const px = (v: string | undefined) => {
    const n = Number.parseFloat(v ?? '0')
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0
  }
  const result = {
    top: px(style?.paddingTop),
    right: px(style?.paddingRight),
    bottom: px(style?.paddingBottom),
    left: px(style?.paddingLeft),
  }
  probe.remove()
  return result
}

export function collectDisplayDiagnostic(win: Window = window): DisplayDiagnostic {
  const doc = win.document
  const nav = win.navigator as Navigator & { standalone?: boolean }
  const standaloneMedia = win.matchMedia?.('(display-mode: standalone)').matches ?? false
  const iosStandalone = typeof nav.standalone === 'boolean' ? nav.standalone : null
  const standalone = standaloneMedia || iosStandalone === true
  const build = APP_BUILD_DATE
    ? formatBuildMoment(APP_BUILD_DATE)
    : {
        local: 'inconnue',
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: '',
      }
  const vv = win.visualViewport
  return {
    appVersion: APP_VERSION,
    buildIso: APP_BUILD_DATE || 'inconnue',
    buildLocal: build.local,
    timeZone: build.zone,
    utcOffset: build.offset || utcOffsetLabel(new Date()),
    innerWidth: win.innerWidth,
    innerHeight: win.innerHeight,
    screenWidth: win.screen.width,
    screenHeight: win.screen.height,
    devicePixelRatio: win.devicePixelRatio,
    clientHeight: doc.documentElement.clientHeight,
    visualViewport: vv
      ? {
          width: Math.round(vv.width * 10) / 10,
          height: Math.round(vv.height * 10) / 10,
          offsetTop: Math.round(vv.offsetTop * 10) / 10,
          offsetLeft: Math.round(vv.offsetLeft * 10) / 10,
          scale: vv.scale,
        }
      : null,
    safeArea: measureSafeArea(doc),
    orientation: win.innerWidth > win.innerHeight ? 'paysage' : 'portrait',
    displayMode: standalone ? 'standalone (installée)' : 'navigateur (Safari ou autre)',
    navigatorStandalone: iosStandalone,
    rects: {
      shell: rectOf(doc.querySelector('#root > div')),
      main: rectOf(doc.querySelector('main')),
      navigation: rectOf(doc.querySelector('nav[aria-label="Navigation principale"]')),
    },
    map: lastMap,
  }
}

const fmtRect = (r: RectInfo | null) =>
  r ? `x ${r.x}, y ${r.y}, ${r.width} × ${r.height}, bas ${r.bottom}` : 'absent'

/** Plain text the user can copy and paste — French labels, numbers in CSS px. */
export function formatDisplayDiagnostic(d: DisplayDiagnostic, now = Date.now()): string {
  const vv = d.visualViewport
  const map = d.map
  const lines = [
    'Diagnostic d’affichage — CTR Hunting',
    `Version ${d.appVersion}`,
    `Compilation : ${d.buildLocal} (fuseau affiché : ${d.timeZone}, ${d.utcOffset})`,
    `Compilation (UTC, ISO) : ${d.buildIso}`,
    `Mode : ${d.displayMode}${d.navigatorStandalone === null ? '' : ` · navigator.standalone = ${d.navigatorStandalone}`}`,
    `Orientation : ${d.orientation}`,
    `window.innerWidth × innerHeight : ${d.innerWidth} × ${d.innerHeight}`,
    `document clientHeight : ${d.clientHeight}`,
    `screen.width × height : ${d.screenWidth} × ${d.screenHeight} (ratio ${d.devicePixelRatio})`,
    vv
      ? `visualViewport : ${vv.width} × ${vv.height}, offsetTop ${vv.offsetTop}, offsetLeft ${vv.offsetLeft}, échelle ${vv.scale}`
      : 'visualViewport : indisponible',
    `Zones sûres (px) : haut ${d.safeArea.top}, bas ${d.safeArea.bottom}, gauche ${d.safeArea.left}, droite ${d.safeArea.right}`,
    `Coque : ${fmtRect(d.rects.shell)}`,
    `Zone principale : ${fmtRect(d.rects.main)}`,
    `Navigation : ${fmtRect(d.rects.navigation)}`,
    map
      ? `Carte (dernière mesure, il y a ${Math.max(0, Math.round((now - map.takenAt) / 1000))} s, immersif : ${map.immersive ? 'oui' : 'non'}) : conteneur ${fmtRect(map.container)} ; canevas ${fmtRect(map.canvas)}`
      : 'Carte : pas encore ouverte depuis le lancement',
    `Écart bas du viewport − bas de la navigation : ${
      d.rects.navigation ? d.innerHeight - d.rects.navigation.bottom : 'sans objet'
    }`,
    'Aucune position, aucune clé, aucun repère : seulement des mesures d’affichage.',
  ]
  return lines.join('\n')
}
