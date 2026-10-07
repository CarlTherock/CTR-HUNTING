import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/ui'
import { assistantProvider, prepareRequest, requestGeneration } from '../provider'
import type {
  AssistantResponse,
  TransmissionConsent,
  TransmissionPreviewItem,
} from '../provider'
import { useAssistantStore } from '../state/assistantStore'
import type { AssistantResult } from '../types'
import { StatementItem } from './ResultView'

const CONSENT_KEY: Record<
  'coordonnées' | 'notes' | 'photos',
  keyof Omit<TransmissionConsent, 'acknowledged'>
> = { coordonnées: 'coordinates', notes: 'notes', photos: 'photos' }

const CHECK =
  'border-surface-600 bg-surface-800 accent-brand-500 mt-0.5 size-5 shrink-0 rounded'

/**
 * Parcours de consentement AVANT tout service distant : montre exactement
 * la charge utile qui serait transmise, avec trois catégories sensibles
 * décochées par défaut (coordonnées, noms et notes, photos) et une
 * autorisation explicite. Il est prêt, mais INACTIF : tant que le
 * fournisseur est indisponible (`NullAssistantProvider`), l'envoi est
 * impossible et rien ne quitte l'appareil. Ce composant ne fait aucun appel
 * réseau lui-même.
 */
export function ConsentPreview({ result }: { result: AssistantResult }) {
  const consent = useAssistantStore((s) => s.consent)
  const setConsent = useAssistantStore((s) => s.setConsent)
  const [response, setResponse] = useState<AssistantResponse | null>(null)
  const id = useId()

  const preview = useMemo(
    () => prepareRequest(result, consent).preview,
    [result, consent],
  )
  const structure = preview.items.find((item) => item.category === 'structure')
  const sensitive = preview.items.filter(
    (item): item is TransmissionPreviewItem & { category: keyof typeof CONSENT_KEY } =>
      item.category !== 'structure',
  )
  const available = assistantProvider.availability.available
  const canSend = available && consent.acknowledged

  async function send() {
    setResponse(await requestGeneration(assistantProvider, result, consent))
  }

  return (
    <details className="text-sm" data-testid="consent-preview">
      <summary className="text-brand-400 flex min-h-11 cursor-pointer items-center">
        Ce qui serait transmis à un assistant génératif
      </summary>
      <div className="flex flex-col gap-3 pb-2">
        <p
          className="border-status-warning/40 bg-status-warning/10 text-ink-100 rounded-md border p-2 text-xs"
          role="note"
        >
          Rien n’est envoyé. Aucun assistant génératif n’est branché : cet aperçu montre
          seulement ce qui partirait si l’un d’eux l’était un jour, et seulement avec
          votre accord.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink-100 text-xs font-medium">
            Données sensibles à inclure (toutes décochées par défaut)
          </legend>
          {structure && (
            <p className="text-ink-300 text-xs">
              <span className="text-ink-100 font-medium">{structure.title}</span> —
              toujours incluse : {structure.description}
            </p>
          )}
          {sensitive.map((item) => {
            const key = CONSENT_KEY[item.category]
            return (
              <label
                key={item.category}
                className="flex min-h-11 cursor-pointer items-start gap-3 text-xs"
              >
                <input
                  type="checkbox"
                  className={CHECK}
                  checked={consent[key]}
                  onChange={(event) => setConsent({ [key]: event.target.checked })}
                />
                <span className="text-ink-300 min-w-0 break-words">
                  <span className="text-ink-100 font-medium">{item.title}</span> —{' '}
                  {item.description}
                </span>
              </label>
            )
          })}
        </fieldset>

        <div>
          <p className="text-ink-100 text-xs font-medium">
            Charge utile exacte ({preview.characters} caractères)
          </p>
          <pre
            className="bg-surface-950 border-surface-700 text-ink-300 max-h-48 overflow-auto rounded-md border p-2 text-[11px] break-all whitespace-pre-wrap"
            tabIndex={0}
            aria-label="Charge utile exacte qui serait transmise"
            data-testid="payload-preview"
          >
            {preview.payloadJson}
          </pre>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-xs">
          <input
            type="checkbox"
            id={`${id}-ack`}
            className={CHECK}
            checked={consent.acknowledged}
            onChange={(event) => setConsent({ acknowledged: event.target.checked })}
          />
          <span className="text-ink-100">
            J’ai lu l’aperçu ci-dessus et j’autorise cet envoi précis.
          </span>
        </label>

        <Button
          variant="secondary"
          className="h-11 w-full"
          disabled={!canSend}
          aria-disabled={!canSend}
          onClick={() => void send()}
        >
          {available
            ? 'Envoyer à l’assistant génératif'
            : 'Envoi impossible : assistant non activé'}
        </Button>

        {response && response.status !== 'ok' && (
          <p className="text-ink-300 text-xs" role="status">
            {response.reason}
          </p>
        )}
        {response && response.status === 'ok' && (
          <ul
            className="divide-surface-800 divide-y"
            aria-label="Réponse de l’assistant génératif"
          >
            {response.statements.map((statement) => (
              <StatementItem key={statement.id} statement={statement} />
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
