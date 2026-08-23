import { RainViewerProvider } from './RainViewerProvider'
import type { RadarProvider } from './RadarProvider'

export type { RadarProvider } from './RadarProvider'
export { radarTileUrlTemplate } from './RainViewerProvider'

/** Always available — RainViewer's radar API is free and keyless, no
 * setup step (same pattern as `weatherProvider`/`windProvider`). */
export const radarProvider: RadarProvider = new RainViewerProvider()
