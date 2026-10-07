import { version } from '../../package.json'

/** The one name shown to the user (title, manifest, bars, splash). */
export const APP_NAME = 'CTR Hunting'
/** French subtitle of the brand. */
export const APP_TAGLINE = 'Renseignement terrain'
/** Read from package.json at build time, never typed by hand. */
export const APP_VERSION: string = version
/** Moment this bundle was built (ISO 8601, UTC), injected by Vite `define`. */
export const APP_BUILD_DATE: string =
  typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : ''
