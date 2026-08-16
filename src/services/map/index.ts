import { MapTilerProvider } from './MapTilerProvider'
import type { MapProvider } from './MapProvider'

export type { MapProvider, MapInstance, CreateMapOptions } from './MapProvider'

const apiKey = import.meta.env.VITE_MAP_TILES_API_KEY as string | undefined

/** The configured map provider, or `null` when `VITE_MAP_TILES_API_KEY` is
 * unset. Feature code must check for `null` and render an explicit
 * "unavailable" state — per the project's data-quality rule, a missing
 * provider is never silently skipped or faked. */
export const mapProvider: MapProvider | null = apiKey ? new MapTilerProvider(apiKey) : null
