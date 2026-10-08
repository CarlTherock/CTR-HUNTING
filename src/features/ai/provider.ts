import { buildPromptEnvelope } from './prompt'
import type { PromptEnvelope } from './prompt'
import type {
  AssistantResult,
  AssistantToolId,
  ContextFactor,
  EntityKind,
  Statement,
  StatementNature,
} from './types'

/**
 * Adaptateur d'assistant distant : INTERFACE SEULEMENT.
 *
 * Aucun fournisseur n'est choisi, aucune clé n'existe, aucun appel réseau
 * n'est écrit. `NullAssistantProvider` est la seule implémentation : elle
 * déclare l'assistant indisponible et dit pourquoi. Le parcours de
 * consentement (ce qui serait transmis, décoché par défaut) est prêt pour
 * le jour où un vrai fournisseur sera branché derrière un point d'accès
 * serveur sécurisé.
 */

// ------------------------------------------------------------- consentement

export interface TransmissionConsent {
  /** « J'ai lu l'aperçu et j'autorise cet envoi. » Sans cela, rien ne part. */
  acknowledged: boolean
  /** Positions (arrondies à ~100 m) des éléments consultés. */
  coordinates: boolean
  /** Noms, début des notes et textes qui en contiennent. */
  notes: boolean
  /** Identifiants des photos rattachées (jamais les images dans cette version). */
  photos: boolean
}

/** Tout est décoché par défaut ; rien n'est envoyé automatiquement. */
export const NO_CONSENT: TransmissionConsent = Object.freeze({
  acknowledged: false,
  coordinates: false,
  notes: false,
  photos: false,
})

// ----------------------------------------------------------------- requête

export interface MinimizedRef {
  kind: EntityKind
  id: string
  label?: string
  excerpt?: string
  coordinate?: { lat: number; lng: number }
  photoIds?: string[]
}

export interface MinimizedContext {
  tool: AssistantToolId
  generatedAt: string
  /** Comptes et natures : toujours inclus (aucun texte de l'utilisateur). */
  counts: {
    consulted: number
    factors: number
    missingData: number
    statementsByNature: Record<StatementNature, number>
  }
  /** Facteurs : libellés de code, jamais de nom d'utilisateur. */
  factors: ContextFactor[]
  /** Éléments consultés : identifiants opaques toujours ; le reste selon le consentement. */
  consulted: MinimizedRef[]
  /** Présents seulement avec le consentement « notes / textes » : ces
   * textes peuvent contenir des noms saisis par l'utilisateur. */
  texts?: {
    dataUsed: string[]
    dates: { label: string; value: string }[]
    missingData: string[]
  }
}

export interface TransmissionPreviewItem {
  category: 'structure' | 'coordonnées' | 'notes' | 'photos'
  included: boolean
  title: string
  description: string
  count: number
}

export interface TransmissionPreview {
  items: TransmissionPreviewItem[]
  /** Charge utile EXACTE (celle qui partirait), pour relecture. */
  payloadJson: string
  characters: number
}

export interface AssistantRequest {
  tool: AssistantToolId
  context: MinimizedContext
  question: string | null
  prompt: PromptEnvelope
  preview: TransmissionPreview
  consent: TransmissionConsent
}

// ----------------------------------------------------------------- réponse

export type AssistantResponse =
  | { status: 'ok'; statements: Statement<StatementNature>[] }
  | { status: 'unavailable'; reason: string; missing: string[] }
  | { status: 'refused'; reason: string }
  | { status: 'error'; reason: string }

export interface ProviderAvailability {
  available: boolean
  reason: string
  /** Ce qui manque pour l'activer, en français. */
  missing: string[]
}

export interface AssistantProvider {
  readonly id: string
  readonly availability: ProviderAvailability
  generate(request: AssistantRequest): Promise<AssistantResponse>
}

/** Ce qui manque avant qu'un assistant génératif puisse exister. */
export const GENERATIVE_MISSING: readonly string[] = [
  'Un point d’accès serveur sécurisé qui garde la clé du fournisseur côté serveur (une clé d’IA ne peut pas être placée dans l’application).',
  'Une authentification des appareils et des limites de débit sur ce point d’accès.',
  'Une décision de fournisseur et de coût : aucun fournisseur n’est choisi, aucun budget n’est engagé.',
  'Une politique de confidentialité et de conservation des données transmises (vos positions de chasse sont sensibles).',
  'Votre consentement explicite avant tout envoi : le parcours d’aperçu est prêt, mais inactif tant qu’aucun fournisseur n’existe.',
]

export class NullAssistantProvider implements AssistantProvider {
  readonly id = 'null'
  readonly availability: ProviderAvailability = {
    available: false,
    reason:
      'Assistant génératif non activé : aucun fournisseur, aucun point d’accès serveur et aucune clé. Rien n’est envoyé.',
    missing: [...GENERATIVE_MISSING],
  }

  // Volontairement sans effet réseau : il n'y a rien à appeler.
  generate(): Promise<AssistantResponse> {
    return Promise.resolve({
      status: 'unavailable',
      reason: this.availability.reason,
      missing: this.availability.missing,
    })
  }
}

/** Le fournisseur de l'application : aucun. */
export const assistantProvider: AssistantProvider = new NullAssistantProvider()

// ------------------------------------------------------------ minimisation

const roundCoordinate = (value: number) => Math.round(value * 1000) / 1000

function natureCounts(result: AssistantResult): Record<StatementNature, number> {
  const counts: Record<StatementNature, number> = {
    'fait enregistré': 0,
    calcul: 0,
    estimation: 0,
    'interprétation IA': 0,
  }
  for (const section of result.sections) {
    for (const statement of section.statements) counts[statement.nature] += 1
  }
  return counts
}

/**
 * Réduit le contexte à ce qui est strictement nécessaire. Par défaut
 * (aucun consentement) : outil, heure, comptes, facteurs de code et
 * identifiants opaques des éléments consultés. Ni coordonnées, ni notes, ni
 * noms, ni photos. Chaque catégorie s'ajoute seulement si elle est cochée.
 * Les textes des énoncés ne sont JAMAIS transmis (ils peuvent mêler noms,
 * notes et positions) : seul le contexte structuré l'est.
 */
export function minimizeContext(
  result: AssistantResult,
  consent: TransmissionConsent,
): MinimizedContext {
  const { context } = result
  const minimized: MinimizedContext = {
    tool: context.tool,
    generatedAt: context.generatedAt,
    counts: {
      consulted: context.consultedTotal,
      factors: context.factors.length,
      missingData: context.missingData.length,
      statementsByNature: natureCounts(result),
    },
    factors: context.factors.map((f) => ({ ...f })),
    consulted: context.consulted.map((ref) => {
      const out: MinimizedRef = { kind: ref.kind, id: ref.id }
      if (consent.notes) {
        out.label = ref.label
        if (ref.excerpt) out.excerpt = ref.excerpt
      }
      if (consent.coordinates && ref.coordinate) {
        out.coordinate = {
          lat: roundCoordinate(ref.coordinate.lat),
          lng: roundCoordinate(ref.coordinate.lng),
        }
      }
      if (consent.photos && ref.photoIds && ref.photoIds.length > 0) {
        out.photoIds = [...ref.photoIds]
      }
      return out
    }),
  }
  if (consent.notes) {
    minimized.texts = {
      dataUsed: [...context.dataUsed],
      dates: context.dates.map((d) => ({ ...d })),
      missingData: [...context.missingData],
    }
  }
  return minimized
}

export function buildTransmissionPreview(
  result: AssistantResult,
  consent: TransmissionConsent,
  payload?: unknown,
): TransmissionPreview {
  const refs = result.context.consulted
  const withCoordinates = refs.filter((r) => r.coordinate).length
  const withNotes = refs.filter((r) => r.excerpt).length
  const photoCount = refs.reduce((n, r) => n + (r.photoIds?.length ?? 0), 0)
  const body = payload ?? { context: minimizeContext(result, consent) }
  const payloadJson = JSON.stringify(body, null, 2)
  return {
    items: [
      {
        category: 'structure',
        included: true,
        title: 'Structure de l’analyse',
        description:
          'Outil utilisé, heure, comptes, facteurs de calcul et identifiants opaques des éléments consultés. Aucun nom, aucune note, aucune position.',
        count: refs.length,
      },
      {
        category: 'coordonnées',
        included: consent.coordinates,
        title: 'Coordonnées',
        description: `Positions des éléments consultés, arrondies à environ 100 m (${withCoordinates} élément(s) ont une position).`,
        count: withCoordinates,
      },
      {
        category: 'notes',
        included: consent.notes,
        title: 'Noms et notes',
        description: `Noms des éléments, début des notes (120 caractères au plus) et textes qui les citent (${withNotes} élément(s) ont une note). Transmis comme données, jamais comme instructions.`,
        count: withNotes,
      },
      {
        category: 'photos',
        included: consent.photos,
        title: 'Photos',
        description: `Identifiants des photos rattachées (${photoCount}). Les images elles-mêmes ne sont pas transmises dans cette version.`,
        count: photoCount,
      },
    ],
    payloadJson,
    characters: payloadJson.length,
  }
}

/** Prépare la requête (aucun envoi). Pure. */
export function prepareRequest(
  result: AssistantResult,
  consent: TransmissionConsent,
  question: string | null = null,
): AssistantRequest {
  const context = minimizeContext(result, consent)
  const trimmed = question?.trim() ? question.trim().slice(0, 500) : null
  const payload = { question: trimmed, context }
  return {
    tool: result.tool,
    context,
    question: trimmed,
    prompt: buildPromptEnvelope(payload),
    preview: buildTransmissionPreview(result, consent, payload),
    consent,
  }
}

/**
 * Seul chemin vers `provider.generate` : refuse sans consentement explicite
 * et n'appelle pas un fournisseur indisponible. Sans consentement ou sans
 * fournisseur, RIEN n'est construit ni transmis.
 */
export async function requestGeneration(
  provider: AssistantProvider,
  result: AssistantResult,
  consent: TransmissionConsent,
  question: string | null = null,
): Promise<AssistantResponse> {
  if (!consent.acknowledged) {
    return {
      status: 'refused',
      reason:
        'Consentement requis : cochez l’autorisation après avoir lu l’aperçu. Rien n’a été envoyé.',
    }
  }
  if (!provider.availability.available) {
    return {
      status: 'unavailable',
      reason: provider.availability.reason,
      missing: provider.availability.missing,
    }
  }
  return provider.generate(prepareRequest(result, consent, question))
}
