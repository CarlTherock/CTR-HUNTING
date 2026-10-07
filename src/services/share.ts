export interface SharePayload {
  title: string
  text: string
  url: string
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported' | 'failed'

/** Whether the browser exposes the native share sheet at all. */
export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/**
 * Opens the native share sheet (Web Share API) for `payload`. Must be called
 * straight from a user gesture. Nothing is ever shared without the user
 * choosing a target in the system sheet.
 *
 *  - `shared`      the system sheet completed;
 *  - `cancelled`   the user dismissed it (AbortError) — not an error;
 *  - `unsupported` no Web Share API, or `canShare` refuses this payload;
 *  - `failed`      any other failure.
 */
export async function sharePayload(payload: SharePayload): Promise<ShareOutcome> {
  if (!canNativeShare()) return 'unsupported'
  const data: ShareData = { title: payload.title, text: payload.text, url: payload.url }
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare(data)) {
      return 'unsupported'
    }
    await navigator.share(data)
    return 'shared'
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: unknown }).name === 'AbortError'
    ) {
      return 'cancelled'
    }
    return 'failed'
  }
}
