import { OpenMeteoWindProvider } from './OpenMeteoWindProvider'
import type { WindProvider } from './WindProvider'

export type { WindProvider } from './WindProvider'

/** Always available — same keyless Open-Meteo provider as weather, no
 * key management step. */
export const windProvider: WindProvider = new OpenMeteoWindProvider()
