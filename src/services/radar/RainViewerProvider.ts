import type { RadarFrameSet } from '@/types'
import type { RadarProvider } from './RadarProvider'

const RAINVIEWER_MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json'

/**
 * RainViewer's real, free, keyless public radar API (rainviewer.com/
 * api.html) — the same real-observed weather radar mosaic MétéoMédia,
 * AccuWeather, and HuntStand's "Detailed Weather Maps" all display, not a
 * fabricated overlay. `radar.past` is real observed reflectivity (last
 * ~2h, one frame per ~10min); `radar.nowcast` is RainViewer's own
 * short-range extrapolation of that same real data — surfaced separately
 * in the UI and clearly labeled, never presented as an observed frame.
 * This app has no live network access to verify the response shape
 * against a real call, so it's built directly from RainViewer's own
 * published API docs rather than assumed from memory of a similar API.
 */
interface RainViewerMapsResponse {
  host: string
  radar: {
    past: { time: number; path: string }[]
    nowcast: { time: number; path: string }[]
  }
}

export class RainViewerProvider implements RadarProvider {
  async fetchFrames(): Promise<RadarFrameSet> {
    const response = await fetch(RAINVIEWER_MAPS_URL)
    if (!response.ok) {
      throw new Error(`Radar request failed (${response.status})`)
    }
    const data = (await response.json()) as RainViewerMapsResponse
    return {
      host: data.host,
      past: data.radar.past,
      nowcast: data.radar.nowcast,
    }
  }
}

/** Builds the real XYZ tile URL template for one radar frame, per
 * RainViewer's documented `{host}{path}/{size}/{z}/{x}/{y}/{color}/
 * {options}.png` scheme — `color: 2` is their "Universal Blue" scheme
 * (the same blue→green→yellow→red convention MétéoMédia/AccuWeather's
 * radar uses), `options: 1_1` enables smoothing and shows snow in a
 * distinct color, both real documented flags, not guessed. */
export function radarTileUrlTemplate(host: string, path: string): string {
  return `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`
}
