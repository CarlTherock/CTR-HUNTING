/**
 * Content-Security-Policy for the production build.
 *
 * GitHub Pages cannot send HTTP headers, so the policy ships as a <meta>
 * tag. Limits of that approach (documented in docs/SECURITY.md):
 * `frame-ancestors`, `report-uri` and `sandbox` are ignored in a meta tag,
 * and there is no Report-Only mode.
 *
 * Every remote host below is one the app really calls today. Providers are
 * listed explicitly rather than allowing `https:` wholesale.
 */
const PROVIDER_HOSTS = [
  'https://api.maptiler.com',
  'https://*.arcgis.com',
  'https://*.arcgisonline.com',
  'https://api.open-meteo.com',
  'https://overpass-api.de',
  'https://s3.amazonaws.com',
  'https://tilecache.rainviewer.com',
  'https://api.rainviewer.com',
  'https://geo.weather.gc.ca',
  'https://geoegl.msp.gouv.qc.ca',
  'https://geo.environnement.gouv.qc.ca',
  'https://servicescarto.mrnf.gouv.qc.ca',
]

/** `extraHosts` lets the E2E build allow its simulated backend only. */
export function buildCsp(extraHosts: string[] = []): string {
  const remote = [...PROVIDER_HOSTS, ...extraHosts].join(' ')
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React and MapLibre set inline style attributes; no inline <style>/<script>.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${remote}`,
    `connect-src 'self' data: blob: ${remote}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
