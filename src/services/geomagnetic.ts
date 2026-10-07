import type { Coordinate } from '@/types'

/**
 * Magnetic declination adapter (angle between magnetic north and TRUE north,
 * in degrees, positive towards the east). A compass reads MAGNETIC north;
 * a bearing computed from coordinates is relative to TRUE north. Converting
 * one to the other needs the declination at the place and date.
 *
 * Source: the `geomagnetism` package (Apache-2.0), which embeds the NOAA/BGS
 * World Magnetic Model (WMM2025, valid 2024-11-13 to 2029-11-13). The
 * computation is entirely local: it works offline. The library is loaded
 * with a dynamic `import()` so it stays out of the main bundle path (it is
 * a separate, precached chunk).
 *
 * Never a guessed value: outside the model's validity period, for an invalid
 * coordinate, or if the model cannot be loaded/evaluated, the answer is
 * `null` ("declination unknown"), and callers must not fall back to 0.
 */

/** Cell size of the cache, in degrees (~55 km north-south). The declination is
 * evaluated at the CENTRE of the cell so the same cell always yields the same
 * value regardless of which coordinate asked first. Over a cell the WMM
 * declination varies by a small fraction of a degree, well below the WMM's own
 * error (~0.5 deg) and far below what a phone compass can resolve. */
export const DECLINATION_CELL_DEGREES = 0.5

interface GeomagnetismModule {
  model: (
    date?: Date,
    options?: { allowOutOfBoundsModel: boolean },
  ) => { point: (geoPoint: number[]) => { decl: number } }
}

type ModelLoader = () => Promise<GeomagnetismModule>

const defaultLoader: ModelLoader = async () => {
  const imported = (await import('geomagnetism')) as unknown as GeomagnetismModule & {
    default?: GeomagnetismModule
  }
  // The package is CommonJS: bundlers expose it as `default` and/or as
  // named exports depending on interop. Accept either shape.
  return typeof imported.model === 'function'
    ? imported
    : (imported.default as GeomagnetismModule)
}

let loader: ModelLoader = defaultLoader
let loaded: Promise<GeomagnetismModule | null> | null = null
const cache = new Map<string, number | null>()

/** Test seam: replaces how the model library is loaded, and clears caches. */
export function __setGeomagnetismLoaderForTests(next: ModelLoader | null): void {
  loader = next ?? defaultLoader
  loaded = null
  cache.clear()
}

function loadModel(): Promise<GeomagnetismModule | null> {
  loaded ??= loader().then(
    (module) => (typeof module?.model === 'function' ? module : null),
    () => null,
  )
  return loaded
}

function cellCentre(value: number): number {
  return (
    Math.floor(value / DECLINATION_CELL_DEGREES) * DECLINATION_CELL_DEGREES +
    DECLINATION_CELL_DEGREES / 2
  )
}

/** Cache key: the model changes slowly (a few hundredths of a degree per
 * month), so one entry per cell and calendar month is exact enough. */
function cacheKey(lat: number, lng: number, date: Date): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}@${date.getUTCFullYear()}-${date.getUTCMonth()}`
}

export async function getDeclination(
  coordinate: Pick<Coordinate, 'lat' | 'lng'>,
  date: Date,
): Promise<number | null> {
  const { lat, lng } = coordinate
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180 ||
    !Number.isFinite(date.getTime())
  ) {
    return null
  }
  const centreLat = Math.max(-89.75, Math.min(89.75, cellCentre(lat)))
  const centreLng = cellCentre(lng === 180 ? -180 : lng)
  const key = cacheKey(centreLat, centreLng, date)
  if (cache.has(key)) return cache.get(key) ?? null

  const module = await loadModel()
  let result: number | null = null
  if (module) {
    try {
      // `allowOutOfBoundsModel: false` (the default) makes the library throw
      // outside the WMM validity period: that becomes `null`, not an
      // extrapolated number.
      const point = module
        .model(date, { allowOutOfBoundsModel: false })
        .point([centreLat, centreLng])
      result = Number.isFinite(point.decl) ? point.decl : null
    } catch {
      result = null
    }
  }
  cache.set(key, result)
  return result
}
