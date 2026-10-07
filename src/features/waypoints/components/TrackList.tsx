import { useState } from 'react'
import { AlertTriangle, Check, Pencil, Route, Trash2, X } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui'
import { formatDistanceMeters, formatDuration } from '@/utils/format'
import { isInterruptedTrack, useTracksStore } from '../state/tracksStore'
import type { Track } from '@/types'

const ACTION_BUTTON =
  'text-ink-300 hover:bg-surface-800 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm disabled:cursor-not-allowed disabled:opacity-40'

/** Stable ref callback: moves focus into the confirmation dialog when it opens. */
function focusOnMount(element: HTMLDivElement | null) {
  element?.focus()
}

function trackDurationMs(track: Track, isRecording: boolean): number {
  const start = new Date(track.startedAt).getTime()
  const end = track.endedAt
    ? new Date(track.endedAt).getTime()
    : isRecording
      ? Date.now()
      : start
  return end - start
}

/**
 * Recorded GPS tracks: rename, delete (always confirmed — a track is
 * irreplaceable), and recovery of tracks that were cut short. A track with
 * no end time that is not being recorded now is shown as "interrompue"; its
 * data is untouched until the user resumes or finishes it.
 */
export function TrackList() {
  const tracks = useTracksStore((state) => state.tracks)
  const status = useTracksStore((state) => state.status)
  const recordingId = useTracksStore((state) => state.recordingId)
  const deleteTrack = useTracksStore((state) => state.deleteTrack)
  const renameTrack = useTracksStore((state) => state.renameTrack)
  const resumeInterrupted = useTracksStore((state) => state.resumeInterrupted)
  const finishInterrupted = useTracksStore((state) => state.finishInterrupted)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sorted = [...tracks].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  )

  async function run(action: () => Promise<unknown>, failure: string) {
    setError(null)
    try {
      await action()
    } catch {
      setError(failure)
    }
  }

  async function submitRename(id: string) {
    await run(async () => {
      const done = await renameTrack(id, draftName)
      if (done) setRenamingId(null)
    }, 'Impossible de renommer la trace : l’écriture sur l’appareil a échoué.')
  }

  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={<Route size={28} aria-hidden="true" />}
        title="Aucune trace"
        description="Ouvrez la carte, puis Outils › Enregistrer une trace GPS pour suivre un parcours."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-status-danger text-sm">
          {error}
        </p>
      )}
      {sorted.map((track) => {
        const isRecording = track.id === recordingId
        const interrupted = isInterruptedTrack(track, recordingId)
        const renaming = renamingId === track.id
        const confirming = confirmingId === track.id
        return (
          <Card key={track.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              {renaming ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void submitRename(track.id)
                  }}
                >
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    maxLength={80}
                    aria-label={`Nouveau nom de ${track.name}`}
                    autoFocus
                    className="border-surface-600 bg-surface-900 text-ink-100 min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-base"
                  />
                  <button
                    type="submit"
                    aria-label="Enregistrer le nom"
                    className={ACTION_BUTTON}
                  >
                    <Check size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    aria-label="Annuler le renommage"
                    className={ACTION_BUTTON}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0">
                    <span className="text-ink-100 block truncate text-sm font-medium">
                      {track.name}
                      {isRecording && (
                        <span className="text-status-danger ml-2 text-xs font-normal">
                          ● {status === 'paused' ? 'En pause' : 'Enregistrement'}
                        </span>
                      )}
                      {interrupted && (
                        <span className="text-status-warning ml-2 text-xs font-normal">
                          Interrompue
                        </span>
                      )}
                    </span>
                    <span className="text-ink-500 block truncate text-xs">
                      {formatDistanceMeters(track.distanceMeters ?? 0)} ·{' '}
                      {formatDuration(trackDurationMs(track, isRecording))} ·{' '}
                      {new Date(track.startedAt).toLocaleDateString('fr-CA')}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(track.id)
                        setDraftName(track.name)
                      }}
                      aria-label={`Renommer ${track.name}`}
                      className={ACTION_BUTTON}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(track.id)}
                      disabled={isRecording}
                      aria-label={`Supprimer ${track.name}`}
                      title={
                        isRecording
                          ? 'Arrêtez l’enregistrement avant de supprimer'
                          : 'Supprimer la trace'
                      }
                      className={`${ACTION_BUTTON} hover:text-status-danger`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </div>

            {interrupted && (
              <div className="bg-surface-900 text-ink-300 flex flex-col gap-2 rounded-lg p-2 text-xs">
                <p className="flex items-start gap-2">
                  <AlertTriangle
                    size={14}
                    aria-hidden="true"
                    className="text-status-warning mt-0.5 shrink-0"
                  />
                  L’enregistrement s’est arrêté avant d’être terminé (
                  {track.points.length} points conservés). Reprendre relie le dernier
                  point au suivant par une ligne droite, sans trajet réel entre les deux.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => resumeInterrupted(track.id)}
                    disabled={status !== 'idle'}
                    className={`${ACTION_BUTTON} border-surface-600 border`}
                  >
                    Reprendre l’enregistrement
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(
                        () => finishInterrupted(track.id),
                        'Impossible de terminer la trace : l’écriture sur l’appareil a échoué.',
                      )
                    }
                    className={`${ACTION_BUTTON} border-surface-600 border`}
                  >
                    Terminer la trace
                  </button>
                </div>
              </div>
            )}

            {confirming && (
              <div
                ref={focusOnMount}
                tabIndex={-1}
                role="alertdialog"
                aria-label={`Confirmer la suppression de ${track.name}`}
                className="border-status-danger/50 flex flex-col gap-2 rounded-lg border p-2 text-sm outline-none"
              >
                <p className="text-ink-100">
                  Supprimer définitivement « {track.name} » ({track.points.length} points)
                  ? Cette action est irréversible.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className={`${ACTION_BUTTON} border-surface-600 border`}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        await deleteTrack(track.id)
                        setConfirmingId(null)
                      }, 'Impossible de supprimer la trace : l’écriture sur l’appareil a échoué.')
                    }
                    className={`${ACTION_BUTTON} bg-status-danger/15 text-status-danger border-status-danger/50 border`}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
