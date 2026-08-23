/**
 * Real precipitation radar frames from RainViewer's free public API
 * (rainviewer.com/api.html — no key, no signup) — the same kind of
 * radar mosaic MétéoMédia/AccuWeather/HuntStand show on their map tools.
 * `past` covers roughly the last 2 hours of real observed radar; `nowcast`
 * is RainViewer's own short-range (~30-60min) extrapolation, clearly
 * labeled as such in the UI — never presented as an observed frame.
 */
export interface RadarFrame {
  /** Unix seconds this frame represents. */
  time: number
  /** RainViewer's own per-frame path segment — combined with `host` and a
   * `{z}/{x}/{y}` template to form the real tile URL, never guessed. */
  path: string
}

export interface RadarFrameSet {
  /** Tile host, e.g. `https://tilecache.rainviewer.com` — read from the
   * API response rather than hardcoded, in case RainViewer moves hosts. */
  host: string
  past: RadarFrame[]
  nowcast: RadarFrame[]
}
