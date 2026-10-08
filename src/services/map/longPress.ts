/** Long-press detection on the map (touch), kept free of any map library so it
 * is testable. A press counts only if a single finger stays (almost) still for
 * `delayMs`; a drag, a second finger, a lift or a cancel abandons it. */
export interface LongPressOptions {
  delayMs?: number
  /** Movement (CSS px) tolerated before the press becomes a drag. */
  moveTolerancePx?: number
  onLongPress: (point: { x: number; y: number }) => void
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface LongPressDetector {
  start: (point: { x: number; y: number }, touchCount: number) => void
  move: (point: { x: number; y: number }) => void
  /** Finger lifted, gesture cancelled or camera started moving. */
  cancel: () => void
  /** True for a short while after a long press fired: the click the browser
   * may still emit on release must not also act on the map. */
  justFired: (nowMs: number) => boolean
}

export const LONG_PRESS_DELAY_MS = 550
export const LONG_PRESS_CLICK_GUARD_MS = 600

export function createLongPressDetector(options: LongPressOptions): LongPressDetector {
  const delay = options.delayMs ?? LONG_PRESS_DELAY_MS
  const tolerance = options.moveTolerancePx ?? 10
  const setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms))
  const clearTimer =
    options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  let origin: { x: number; y: number } | null = null
  let handle: unknown = null
  let firedAt = -Infinity

  function cancel() {
    if (handle !== null) clearTimer(handle)
    handle = null
    origin = null
  }

  return {
    start(point, touchCount) {
      cancel()
      if (touchCount !== 1) return
      origin = point
      handle = setTimer(() => {
        const at = origin
        handle = null
        origin = null
        if (!at) return
        firedAt = Date.now()
        options.onLongPress(at)
      }, delay)
    },
    move(point) {
      if (!origin) return
      if (Math.hypot(point.x - origin.x, point.y - origin.y) > tolerance) cancel()
    },
    cancel,
    justFired: (nowMs) => nowMs - firedAt < LONG_PRESS_CLICK_GUARD_MS,
  }
}
