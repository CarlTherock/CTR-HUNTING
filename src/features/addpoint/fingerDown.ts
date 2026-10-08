/** Tracks whether a finger is currently on the screen, so a panel opened by a
 * long press can swallow the click the browser emits when that finger lifts
 * (otherwise it lands on the panel's backdrop and closes the panel at once). */
let touchesDown = 0
let installed = false

function install() {
  if (installed || typeof document === 'undefined') return
  installed = true
  const update = (event: TouchEvent) => {
    touchesDown = event.touches.length
  }
  for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const) {
    document.addEventListener(type, update, { capture: true, passive: true })
  }
}

// Installed as soon as the module loads, before any touch can start.
install()

export function fingerIsDown(): boolean {
  install()
  return touchesDown > 0
}

/** Calls `onRelease` once, when the last finger lifts. Returns a cleanup. */
export function onFingerRelease(onRelease: () => void): () => void {
  const handler = (event: TouchEvent) => {
    if (event.touches.length > 0) return
    cleanup()
    onRelease()
  }
  const cleanup = () => {
    document.removeEventListener('touchend', handler, true)
    document.removeEventListener('touchcancel', handler, true)
  }
  document.addEventListener('touchend', handler, true)
  document.addEventListener('touchcancel', handler, true)
  return cleanup
}
