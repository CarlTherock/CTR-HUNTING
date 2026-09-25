import { GeoMetProvider } from './GeoMetProvider'

export * from './GeoMetProvider'

/** Always available — GeoMet is free and keyless. */
export const weatherMapProvider = new GeoMetProvider()
