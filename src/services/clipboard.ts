/**
 * Clipboard adapter. `copyText` resolves `true` only when the text really
 * reached the clipboard, and never throws — the UI confirms a copy only on
 * `true`.
 *
 *  - Secure contexts with the async Clipboard API: `navigator.clipboard.writeText`.
 *    A rejection (permission denied, no focus, ...) is a failure: it is
 *    reported as `false`, not retried through another channel.
 *  - API absent (older iOS WebViews, insecure origins): a hidden-textarea
 *    `document.execCommand('copy')` fallback that works from a user gesture.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        return false
      }
    }
    return execCommandCopy(text)
  } catch {
    return false
  }
}

function execCommandCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return false
  }
  const previouslyFocused = document.activeElement as HTMLElement | null
  const textarea = document.createElement('textarea')
  textarea.value = text
  // readonly keeps the iOS keyboard closed; 16px avoids the focus zoom;
  // it must stay "visible" (not display:none) or iOS refuses to select it.
  textarea.setAttribute('readonly', '')
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;font-size:16px;'
  document.body.appendChild(textarea)
  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy') === true
  } catch {
    return false
  } finally {
    textarea.remove()
    try {
      previouslyFocused?.focus?.({ preventScroll: true })
    } catch {
      /* focus restoration is best effort */
    }
  }
}
