/**
 * Screen Wake Lock adapter. Only this file touches `navigator.wakeLock`.
 *
 * Keeping the screen on while a track is being recorded avoids the most
 * common cause of a cut-off recording (the phone locking). It is
 * best-effort: the API may be missing (older iOS, some browsers), refused
 * (low battery / power saver) or released by the system when the page is
 * hidden. It does NOT make GPS work in the background — on iPhone, Safari
 * and installed web apps stop receiving GPS positions once the page is no
 * longer visible.
 */
export interface WakeLockHandle {
  release: () => Promise<void>
}

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

/** Requests a screen wake lock; resolves to `null` when unsupported or refused. */
export async function requestScreenWakeLock(
  onReleased?: () => void,
): Promise<WakeLockHandle | null> {
  if (!isWakeLockSupported()) return null
  try {
    const sentinel = await navigator.wakeLock.request('screen')
    if (onReleased) sentinel.addEventListener('release', onReleased)
    return { release: () => sentinel.release() }
  } catch {
    return null
  }
}
