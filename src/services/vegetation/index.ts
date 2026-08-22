import { OverpassVegetationProvider } from './OverpassVegetationProvider'
import type { VegetationProvider } from './VegetationProvider'
export type { VegetationProvider } from './VegetationProvider'

export const vegetationProvider: VegetationProvider = new OverpassVegetationProvider()
