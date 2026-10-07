import type { BrowserContext, Page } from '@playwright/test'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ControlInfo {
  label: string
  rect: Rect
  rendered: boolean
  inViewport: boolean
  /** The element at the control's centre is the control itself (or a
   * child): it is not covered by something else. */
  hit: boolean
  minSide: number
}

export interface LayoutMeasure {
  viewport: { innerWidth: number; innerHeight: number; visualWidth: number; visualHeight: number; scale: number }
  document: { scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number }
  rects: Record<string, Rect | null>
  controls: ControlInfo[]
}

/** Safe-area insets (CSS px) as an iPhone with a notch / home indicator
 * would report them. Chromium-only (CDP); WebKit has no equivalent. */
export interface SafeArea {
  top: number
  bottom: number
  left: number
  right: number
}

export const IPHONE_PORTRAIT_SAFE_AREA: SafeArea = { top: 47, bottom: 34, left: 0, right: 0 }
export const IPHONE_LANDSCAPE_SAFE_AREA: SafeArea = { top: 0, bottom: 21, left: 47, right: 47 }

export async function applySafeArea(context: BrowserContext, page: Page, insets: SafeArea): Promise<void> {
  const session = await context.newCDPSession(page)
  await session.send('Emulation.setSafeAreaInsetsOverride', { insets })
}

/** Measures the real rectangles of the layout chain and of every
 * interactive control inside `main`, from the browser itself. */
export async function measureLayout(page: Page, controlScope = 'main'): Promise<LayoutMeasure> {
  return page.evaluate((scope) => {
    const rect = (element: Element | null) => {
      if (!element) return null
      const r = element.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    const scroller = document.scrollingElement ?? document.documentElement
    const visual = window.visualViewport
    const innerWidth = window.innerWidth
    const innerHeight = window.innerHeight

    const controls = [...document.querySelectorAll(`${scope} button, ${scope} a[href], ${scope} [role="button"], ${scope} input, ${scope} select`)]
      .map((element) => {
        const r = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        const rendered =
          r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0
        const cx = r.x + r.width / 2
        const cy = r.y + r.height / 2
        const inViewport = r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= innerWidth + 0.5 && r.y + r.height <= innerHeight + 0.5
        const top = rendered && cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight ? document.elementFromPoint(cx, cy) : null
        const label =
          element.getAttribute('aria-label') ?? element.getAttribute('title') ?? (element.textContent ?? '').trim().slice(0, 40)
        return {
          label,
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          rendered,
          inViewport,
          hit: top !== null && (top === element || element.contains(top)),
          minSide: Math.min(r.width, r.height),
        }
      })
      .filter((control) => control.rendered)

    return {
      viewport: {
        innerWidth,
        innerHeight,
        visualWidth: visual?.width ?? innerWidth,
        visualHeight: visual?.height ?? innerHeight,
        scale: visual?.scale ?? 1,
      },
      document: {
        scrollWidth: scroller.scrollWidth,
        scrollHeight: scroller.scrollHeight,
        clientWidth: scroller.clientWidth,
        clientHeight: scroller.clientHeight,
      },
      rects: {
        html: rect(document.documentElement),
        body: rect(document.body),
        root: rect(document.getElementById('root')),
        shell: rect(document.querySelector('#root > div')),
        main: rect(document.querySelector('main')),
        mapContainer: rect(document.querySelector('[data-testid="map-container"]')),
        canvas: rect(document.querySelector('canvas.maplibregl-canvas')),
      },
      controls,
    }
  }, controlScope)
}
