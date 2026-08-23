import type { RadarFrameSet } from '@/types'

/**
 * Adapter contract for the precipitation radar engine — same "external
 * providers stay behind an adapter" rule as `WeatherProvider`/`WindProvider`.
 */
export interface RadarProvider {
  /** Throws on a network/HTTP failure — callers are responsible for
   * catching and falling back gracefully, never fabricating frames. */
  fetchFrames(): Promise<RadarFrameSet>
}
