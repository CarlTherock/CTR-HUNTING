/** Small, side-effect-free platform checks for the install experience. */

/** True when installed and launched as a standalone app (Android/desktop via
 * `display-mode`, iOS Safari via the legacy `navigator.standalone` flag) —
 * never true for an ordinary browser tab. */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
  let displayMode: boolean
  try {
    displayMode = window.matchMedia('(display-mode: standalone)').matches
  } catch {
    displayMode = false
  }
  return displayMode || iosStandalone === true
}

/** iPhone / iPod / iPad, including iPadOS 13+ which reports itself as a Mac
 * (told apart by its touch screen). A user-agent check can be wrong; it is
 * only used to decide which instructions to show. */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent ?? ''
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
}
