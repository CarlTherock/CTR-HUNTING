import type { Page } from '@playwright/test'

/**
 * SIMULATED browser capabilities injected before the app loads. They prove
 * the app's logic (what it calls, what it shows) — not the behaviour of a
 * real iOS share sheet, clipboard or GPS receiver.
 */

/** Makes `navigator.share` record its argument in `window.__shared`. */
export async function stubShare(
  page: Page,
  mode: 'success' | 'abort' | 'fail' | 'absent',
): Promise<void> {
  await page.addInitScript((m) => {
    const w = window as unknown as { __shared?: unknown[] }
    w.__shared = []
    if (m === 'absent') {
      Object.defineProperty(Navigator.prototype, 'share', {
        value: undefined,
        configurable: true,
      })
      Object.defineProperty(Navigator.prototype, 'canShare', {
        value: undefined,
        configurable: true,
      })
      return
    }
    Object.defineProperty(Navigator.prototype, 'canShare', {
      value: undefined,
      configurable: true,
    })
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      writable: true,
      value: async (data: unknown) => {
        w.__shared?.push(data)
        if (m === 'abort') throw new DOMException('cancelled', 'AbortError')
        if (m === 'fail') throw new DOMException('refused', 'NotAllowedError')
      },
    })
  }, mode)
}

/** Makes every `navigator.clipboard.writeText` reject (permission denied). */
export async function stubClipboardDenied(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(Clipboard.prototype, 'writeText', {
      configurable: true,
      writable: true,
      value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
    })
    // The legacy fallback must not rescue a denied clipboard in this test.
    document.execCommand = () => false
  })
}

export type GpsStub =
  | { kind: 'searching' }
  | { kind: 'denied' }
  | { kind: 'fix'; lat: number; lng: number; accuracy: number; ageMs: number }

/** Replaces `navigator.geolocation` with a deterministic simulated receiver. */
export async function stubGps(page: Page, stub: GpsStub): Promise<void> {
  await page.addInitScript((s) => {
    Object.defineProperty(Navigator.prototype, 'geolocation', {
      configurable: true,
      get: () => ({
        watchPosition: (
          ok: (p: unknown) => void,
          err?: (e: { code: number; message: string }) => void,
        ) => {
          if (s.kind === 'denied') {
            setTimeout(() => err?.({ code: 1, message: 'User denied Geolocation' }), 50)
          } else if (s.kind === 'fix') {
            setTimeout(
              () =>
                ok({
                  coords: {
                    latitude: s.lat,
                    longitude: s.lng,
                    accuracy: s.accuracy,
                    altitude: null,
                    heading: null,
                    speed: null,
                  },
                  timestamp: Date.now() - s.ageMs,
                }),
              50,
            )
          }
          return 1
        },
        clearWatch: () => undefined,
        getCurrentPosition: () => undefined,
      }),
    })
  }, stub)
}
