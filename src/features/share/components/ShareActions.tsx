import { useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { copyText } from '@/services/clipboard'
import { canNativeShare, sharePayload } from '@/services/share'
import type { SharePayload } from '@/services/share'
import { payloadToClipboardText } from '../shareContent'

export interface ShareActionsProps {
  payload: SharePayload
  /** Label of the native share button, e.g. "Partager ce point". */
  shareLabel: string
  /** Prefix for `data-testid`s (tests only). */
  testId: string
}

type Feedback =
  | { kind: 'none' }
  | { kind: 'shared' }
  | { kind: 'fallback-needed' }
  | { kind: 'copied' }
  | { kind: 'copy-failed' }

/**
 * Share button with an always-reachable fallback. Native share when the
 * browser has it; otherwise — or when it is unsupported/fails — a visible
 * "Copier le texte / lien". Nothing happens without a tap, a cancelled share
 * shows nothing alarming, and "copied" is only ever shown after a copy that
 * really succeeded.
 */
export function ShareActions({ payload, shareLabel, testId }: ShareActionsProps) {
  const native = canNativeShare()
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'none' })
  const [busy, setBusy] = useState(false)
  const fallbackVisible =
    !native || feedback.kind === 'fallback-needed' || feedback.kind === 'copy-failed'

  async function handleShare() {
    setBusy(true)
    try {
      const outcome = await sharePayload(payload)
      if (outcome === 'shared') setFeedback({ kind: 'shared' })
      else if (outcome === 'cancelled') setFeedback({ kind: 'none' })
      else setFeedback({ kind: 'fallback-needed' })
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    const ok = await copyText(payloadToClipboardText(payload))
    setFeedback({ kind: ok ? 'copied' : 'copy-failed' })
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`${testId}-share`}>
      <div className="flex flex-wrap gap-2">
        {native && (
          <Button variant="secondary" size="md" disabled={busy} onClick={handleShare}>
            <Share2 size={14} aria-hidden="true" />
            {shareLabel}
          </Button>
        )}
        {fallbackVisible && (
          <Button variant="secondary" size="md" onClick={() => void handleCopy()}>
            <Copy size={14} aria-hidden="true" />
            Copier le texte / lien
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {!native && feedback.kind === 'none' && (
          <p className="text-ink-500 text-xs">
            Le partage direct n’est pas disponible sur cet appareil : copiez le texte.
          </p>
        )}
        {feedback.kind === 'shared' && (
          <p role="status" className="text-status-success text-xs">
            Partage effectué.
          </p>
        )}
        {feedback.kind === 'fallback-needed' && (
          <p role="status" className="text-ink-300 text-xs">
            Le partage direct n’a pas abouti. Copiez le texte à la place.
          </p>
        )}
        {feedback.kind === 'copied' && (
          <p role="status" className="text-status-success text-xs">
            Texte et lien copiés.
          </p>
        )}
      </div>

      {feedback.kind === 'copy-failed' && (
        <>
          <p role="alert" className="text-status-danger text-sm">
            Copie impossible — sélectionnez et copiez le texte manuellement.
          </p>
          <pre
            data-testid={`${testId}-manual-text`}
            className="bg-surface-800 text-ink-100 rounded-md p-2 text-xs break-words whitespace-pre-wrap select-text"
            style={{ userSelect: 'text' }}
          >
            {payloadToClipboardText(payload)}
          </pre>
        </>
      )}
    </div>
  )
}
