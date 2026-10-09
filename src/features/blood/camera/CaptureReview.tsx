import { useState } from 'react'
import { Button } from '@/components/ui'
import { cn } from '@/utils/cn'
import { useBloodStore } from '../state/bloodStore'
import type { CameraClueFlow, PendingCapture } from './useCameraClue'

export interface CaptureReviewProps {
  capture: PendingCapture
  flow: CameraClueFlow
  note: string
  onNote: (note: string) => void
  onConfirm: () => void
  /** Back to the camera, keeping the capture for a later « + Repère ». */
  onKeep: () => void
  onDiscard: () => void
}

/** The photo just taken, over the camera. The actions sit in a footer that
 * never scrolls: only the body (image, notes, explanations) does. */
export function CaptureReview({
  capture,
  flow,
  note,
  onNote,
  onConfirm,
  onKeep,
  onDiscard,
}: CaptureReviewProps) {
  const [view, setView] = useState<'processed' | 'original'>('processed')
  const openSession = useBloodStore((state) =>
    state.sessions.find((session) => session.status !== 'finished'),
  )
  return (
    <div
      data-testid="capture-review"
      className="bg-surface-950 absolute inset-0 z-20 flex flex-col"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto [overscroll-behavior:contain] pb-2">
        <div role="group" aria-label="Affichage de la capture" className="flex gap-2">
          {(
            [
              ['processed', 'Avec surbrillance'],
              ['original', 'Originale (intacte)'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                'min-h-11 flex-1 rounded-lg border px-2 text-sm',
                view === value
                  ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                  : 'border-surface-600',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <img
          src={view === 'processed' ? capture.processedUrl : capture.originalUrl}
          alt={view === 'processed' ? 'Photo avec surbrillance' : 'Photo originale'}
          className="mx-auto max-h-[45dvh] w-auto max-w-full rounded object-contain"
        />
        {capture.source === 'import' && (
          <p
            role="note"
            className="border-status-warning/60 rounded-lg border p-2 text-xs"
          >
            Photo importée : ce n’est pas le flux en direct. Le point sera placé à la
            position du téléphone maintenant, pas à l’endroit où la photo a été prise.
          </p>
        )}
        {openSession ? (
          <p data-testid="clue-target" className="text-xs">
            Sera rattaché à la recherche : <strong>{openSession.name}</strong>
          </p>
        ) : (
          flow.gate && (
            <div
              role="group"
              aria-label="Aucune recherche ouverte"
              data-testid="clue-gate"
              className="border-surface-600 flex flex-col gap-2 rounded-lg border p-2 text-sm"
            >
              <p>
                Aucune recherche de sang n’est ouverte. Un indice doit être rattaché à une
                recherche. Créer une recherche démarre aussi l’enregistrement de votre
                trace GPS (ou l’attend si le GPS n’est pas prêt).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="md"
                  disabled={flow.busy}
                  onClick={() => void flow.createSearchAndContinue()}
                >
                  Créer une recherche et démarrer ma trace
                </Button>
                <Button variant="secondary" size="md" onClick={flow.dismissGate}>
                  Annuler
                </Button>
              </div>
            </div>
          )
        )}
        <p className="text-ink-300 text-xs">
          Le point sera placé à la position du téléphone, pas à l’endroit exact de la
          tache. Sans position GPS récente, vous la placerez à la main avant
          d’enregistrer. La position est verrouillée à l’enregistrement.
        </p>
        <label className="text-xs">
          Note (facultative)
          <textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            rows={2}
            className="border-surface-600 bg-surface-900 mt-1 w-full rounded-lg border p-2 text-base"
          />
        </label>
        {flow.needsMap && (
          <div
            role="group"
            aria-label="Placement manuel"
            className="border-surface-600 rounded-lg border p-2 text-sm"
          >
            <p>
              Position GPS indisponible ou trop ancienne : placez le point à la main sur
              la carte (ce ne sera pas la position du téléphone).
            </p>
            <Button className="mt-2" variant="primary" size="md" onClick={flow.chooseMap}>
              Placer sur la carte
            </Button>
          </div>
        )}
        {flow.error && (
          <p role="alert" className="text-status-danger text-sm">
            {flow.error}
          </p>
        )}
      </div>
      <div
        className="border-surface-700 flex shrink-0 flex-wrap gap-2 border-t pt-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" disabled={flow.busy} onClick={onConfirm}>
          Confirmer un indice
        </Button>
        <Button variant="secondary" size="lg" disabled={flow.busy} onClick={onKeep}>
          Garder et revenir à la caméra
        </Button>
        <Button variant="secondary" size="lg" disabled={flow.busy} onClick={onDiscard}>
          Écarter cette capture
        </Button>
      </div>
    </div>
  )
}
