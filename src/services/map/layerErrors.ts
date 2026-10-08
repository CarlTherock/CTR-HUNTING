import type { LayerErrorKind } from '@/types'

export interface LayerError {
  kind: LayerErrorKind
  /** French, user-facing: what happened and what the app does about it. */
  message: string
  /** Whether a manual « Réessayer » can plausibly help. */
  retryable: boolean
}

export interface LayerErrorInput {
  /** HTTP status of the failing request, when the engine reports one. */
  status?: number
  /** Raw engine / service message (never shown as-is). */
  rawMessage?: string
  online: boolean
  /** The layer needs a provider key and none is configured. */
  keyMissing?: boolean
  /** The layer cannot work with the current base map. */
  incompatibleWithBase?: boolean
  /** The layer is known to be unavailable offline. */
  offlineUnsupported?: boolean
}

/** Max manual retries before the app stops offering one: no infinite loops. */
export const MAX_LAYER_RETRIES = 3

const MESSAGES: Record<LayerErrorKind, { text: string; retryable: boolean }> = {
  'missing-key': {
    text: 'Clé du fournisseur absente : cette couche n’est pas configurée dans cette version.',
    retryable: false,
  },
  'provider-refused': {
    text: 'Le fournisseur a refusé l’accès (clé invalide, quota ou domaine non autorisé).',
    retryable: true,
  },
  'style-unavailable': {
    text: 'Le style de carte est indisponible chez le fournisseur.',
    retryable: true,
  },
  'tile-failure': {
    text: 'Certaines tuiles n’ont pas pu être chargées (service lent ou indisponible). Le reste de la carte reste utilisable.',
    retryable: true,
  },
  'layer-not-found': {
    text: 'Le service ne reconnaît pas cette couche (nom ou adresse à revérifier). Elle n’est pas validée.',
    retryable: false,
  },
  'bad-params': {
    text: 'Le service a refusé la requête (paramètres ou projection non acceptés). Couche non validée.',
    retryable: false,
  },
  incompatible: {
    text: 'Cette couche n’est pas compatible avec le fond de carte actuel. Changez de fond pour l’utiliser.',
    retryable: false,
  },
  'not-offline': {
    text: 'Hors ligne : cette couche n’a pas été préparée pour un usage sans réseau.',
    retryable: false,
  },
  unknown: {
    text: 'Chargement impossible : cause non identifiée. La carte reste utilisable.',
    retryable: true,
  },
}

/** Turns an engine failure into one typed, user-presentable error. Pure. */
export function classifyLayerError(input: LayerErrorInput): LayerError {
  const kind = kindOf(input)
  const { text, retryable } = MESSAGES[kind]
  return { kind, message: text, retryable }
}

export function layerErrorMessage(kind: LayerErrorKind): string {
  return MESSAGES[kind].text
}

function kindOf(input: LayerErrorInput): LayerErrorKind {
  if (input.keyMissing) return 'missing-key'
  if (input.incompatibleWithBase) return 'incompatible'
  if (!input.online)
    return input.offlineUnsupported === false ? 'tile-failure' : 'not-offline'
  const raw = input.rawMessage ?? ''
  if (/LayerNotDefined|layer.*not (found|defined)|unknown layer/i.test(raw))
    return 'layer-not-found'
  if (/style/i.test(raw) && /(unavailable|failed|not found|404)/i.test(raw))
    return 'style-unavailable'
  if (/InvalidCRS|InvalidParameter|projection|srs|crs|bbox/i.test(raw))
    return 'bad-params'
  switch (input.status) {
    case 401:
    case 403:
    case 429:
      return 'provider-refused'
    case 404:
      return 'layer-not-found'
    case 400:
    case 422:
      return 'bad-params'
    default:
      break
  }
  if (input.status !== undefined && input.status >= 500) return 'tile-failure'
  if (input.status !== undefined || /tile|network|fetch|load/i.test(raw))
    return 'tile-failure'
  return 'unknown'
}

/** Whether « Réessayer » should be offered for an error of this kind. */
export function isRetryableKind(kind: LayerErrorKind | undefined): boolean {
  return kind === undefined ? true : MESSAGES[kind].retryable
}
