import { ENDPOINTS } from '@/services/landcover/OverpassLandCoverProvider'

export interface ServiceCheckResult {
  service: 'Open-Meteo' | 'Overpass (OpenStreetMap)'
  host: string
  ok: boolean
  /** Constat réel : code HTTP reçu ou cause de l'échec. Jamais une valeur inventée. */
  detail: string
  ms: number
}

const METEO =
  'https://api.open-meteo.com/v1/forecast?latitude=46.8&longitude=-71.2&hourly=temperature_2m&forecast_days=1'
const OVERPASS_PING =
  '[out:json][timeout:10];node(46.8,-71.2,46.8001,-71.1999);out count;'

async function probe(
  service: ServiceCheckResult['service'],
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<ServiceCheckResult> {
  const host = new URL(url).host
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const ms = Date.now() - started
    if (!response.ok)
      return { service, host, ok: false, detail: `HTTP ${response.status}`, ms }
    return { service, host, ok: true, detail: `HTTP ${response.status}`, ms }
  } catch (error) {
    const ms = Date.now() - started
    const detail = controller.signal.aborted
      ? `aucune réponse en ${Math.round(timeoutMs / 1000)} s`
      : error instanceof Error
        ? `${error.name}: ${error.message} (réseau coupé ou requête bloquée)`
        : 'erreur'
    return { service, host, ok: false, detail, ms }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Contrôle simple, lancé à la demande depuis l'application : une requête minuscule vers chaque
 * service réellement utilisé. Le résultat dit ce que CET appareil, sur CE réseau, obtient.
 */
export async function checkServices(): Promise<ServiceCheckResult[]> {
  return Promise.all([
    probe('Open-Meteo', METEO, {}, 12_000),
    ...ENDPOINTS.map((endpoint) =>
      probe(
        'Overpass (OpenStreetMap)',
        endpoint,
        { method: 'POST', body: new URLSearchParams({ data: OVERPASS_PING }) },
        15_000,
      ),
    ),
  ])
}
