import { MapLibreProvider } from './MapLibreProvider'
import type { MapProvider } from './MapProvider'
import type { MapBaseLayerId } from '@/types'

export type { MapProvider, MapInstance, CreateMapOptions, DownloadAreaProgress } from './MapProvider'

const mapTilerApiKey = import.meta.env.VITE_MAP_TILES_API_KEY as string | undefined
const esriApiKey = import.meta.env.VITE_ESRI_API_KEY as string | undefined

/** The configured map provider, or `null` when neither
 * `VITE_MAP_TILES_API_KEY` nor `VITE_ESRI_API_KEY` is set. Feature code
 * must check for `null` and render an explicit "unavailable" state — per
 * the project's data-quality rule, a missing provider is never silently
 * skipped or faked. */
export const mapProvider: MapProvider | null =
  mapTilerApiKey || esriApiKey
    ? new MapLibreProvider({ mapTiler: mapTilerApiKey, esri: esriApiKey })
    : null

/** Which base layers actually have a key behind them. `LayerManagerPanel`
 * only offers options from this list — never a layer whose vendor key is
 * unset, which would otherwise silently fail to load. */
export const availableBaseLayers: MapBaseLayerId[] = [
  ...(mapTilerApiKey ? (['outdoor', 'satellite'] as const) : []),
  ...(esriApiKey
    ? ([
        'esri-topographic',
        'esri-imagery',
        'esri-imagery-standard',
        'esri-terrain',
        'esri-hillshade',
        'esri-light-gray',
        'esri-dark-gray',
        'esri-navigation',
      ] as const)
    : []),
]
