import { useState } from 'react'
import { collectDisplayDiagnostic, formatDisplayDiagnostic } from '../displayDiagnostic'

/**
 * Opt-in, read-only display diagnostic. Nothing is measured until the button
 * is pressed, nothing is sent: « Copier » puts the text on the clipboard.
 */
export function DisplayDiagnosticSection() {
  const [text, setText] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'failed'>('idle')

  const measure = () => {
    setCopyState('idle')
    setText(formatDisplayDiagnostic(collectDisplayDiagnostic()))
  }

  const copy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('done')
    } catch {
      // No clipboard permission (or insecure context): the text stays
      // selectable below so it can be copied by hand.
      setCopyState('failed')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        Mesures d’affichage de cet appareil (tailles, zones sûres, mode installé ou
        navigateur). Aucune position, aucune clé, aucun repère ; rien n’est envoyé : vous
        copiez le texte vous-même. Pour la carte, ouvrez-la d’abord puis revenez ici.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={measure}
          className="border-surface-600 bg-surface-800 text-ink-100 min-h-11 rounded-md border px-4 text-sm font-medium"
        >
          {text ? 'Mesurer de nouveau' : 'Afficher le diagnostic'}
        </button>
        {text && (
          <button
            type="button"
            onClick={() => void copy()}
            className="border-surface-600 bg-surface-800 text-ink-100 min-h-11 rounded-md border px-4 text-sm font-medium"
          >
            Copier le diagnostic
          </button>
        )}
      </div>
      {copyState === 'done' && <p role="status">Copié dans le presse-papiers.</p>}
      {copyState === 'failed' && (
        <p role="status">
          Copie impossible ici : sélectionnez le texte ci-dessous et copiez-le.
        </p>
      )}
      {text && (
        <pre
          data-testid="display-diagnostic"
          className="border-surface-700 bg-surface-950 text-ink-100 max-h-80 overflow-auto rounded-md border p-3 text-xs break-words whitespace-pre-wrap select-text"
        >
          {text}
        </pre>
      )}
    </div>
  )
}
