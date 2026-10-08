import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Camera,
  Check,
  Droplets,
  Download,
  Map as MapIcon,
  Pencil,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui'
import { exportGpx } from '@/features/backup/gpx/gpxService'
import { canShareFile, downloadBlob, shareFile } from '@/features/backup/download'
import { useMapStore } from '@/features/map/state/mapStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { formatDistanceMeters, formatDuration } from '@/utils/format'
import {
  SESSION_STATUS_LABEL,
  overviewView,
  sessionClues,
  trackActiveMs,
} from '../sessionLogic'
import { useBloodStore } from '../state/bloodStore'

const BTN =
  'text-ink-300 hover:bg-surface-800 flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm disabled:opacity-40'

interface Consequences {
  waypoints: number
  photos: number
  tracks: number
}

/** The user's blood-search sessions, newest first. Nothing is deleted without
 * a confirmation that states what happens to the track, the points and the
 * photos; export and sharing are explicit, per session. */
export function BloodSessionList() {
  const sessions = useBloodStore((state) => state.sessions)
  const loaded = useBloodStore((state) => state.loaded)
  const rename = useBloodStore((state) => state.rename)
  const deleteSession = useBloodStore((state) => state.deleteSession)
  const tracks = useTracksStore((state) => state.tracks)
  const waypoints = useWaypointsStore((state) => state.waypoints)
  const navigate = useNavigate()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; counts: Consequences } | null>(
    null,
  )
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void useBloodStore.getState().load()
  }, [loaded])

  const sorted = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  async function exportOne(sessionId: string, share: boolean) {
    setMessage(null)
    try {
      const result = await exportGpx({ kind: 'session', sessionId })
      const blob = new Blob([result.xml], { type: 'application/gpx+xml' })
      if (share) {
        const file = new File([blob], result.fileName, { type: 'application/gpx+xml' })
        if (canShareFile(file)) {
          const outcome = await shareFile(file, result.fileName)
          // Cancelling the share sheet is not an error.
          if (outcome === 'failed')
            setMessage('Le partage a échoué. Utilisez Télécharger.')
          return
        }
        setMessage('Partage indisponible ici : le fichier est téléchargé à la place.')
      }
      downloadBlob(blob, result.fileName)
    } catch {
      setMessage('Export impossible : lecture des données de l’appareil échouée.')
    }
  }

  function showOnMap(sessionId: string) {
    const clues = sessionClues(waypoints, sessionId)
    const track = tracks.find((t) => t.sessionId === sessionId)
    const coordinates = [...clues.map((c) => c.coordinate), ...(track?.points ?? [])]
    const fitted = overviewView(coordinates)
    if (fitted) useMapStore.getState().setView(fitted)
    void navigate('/map')
  }

  async function askDelete(id: string) {
    setDeleting({ id, counts: await useBloodStore.getState().contentCounts(id) })
  }

  return (
    <div
      id="recherches-de-sang"
      className="flex scroll-mt-4 flex-col gap-2"
      data-testid="blood-session-list"
    >
      <h2 className="text-ink-300 flex items-center gap-2 text-sm font-semibold">
        <Droplets size={16} aria-hidden="true" />
        Recherches de sang ({sessions.length})
      </h2>
      <Card className="flex flex-col gap-2 p-3 text-sm">
        <p className="text-ink-100 font-semibold">
          Caméra sang (aide visuelle expérimentale)
        </p>
        <p className="text-ink-300 text-xs">
          Surligne des zones de couleur candidates, sans jamais confirmer du sang. S’ouvre
          sans recherche en cours ; un indice enregistré est rattaché à une recherche.
        </p>
        <button
          type="button"
          onClick={() => {
            useBloodStore.getState().openCamera()
            void navigate('/map')
          }}
          className="bg-brand-500 text-surface-950 hover:bg-brand-400 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg px-4 font-semibold"
        >
          <Camera size={16} aria-hidden="true" /> Ouvrir la caméra sang
        </button>
      </Card>
      {message && (
        <p role="status" className="text-ink-300 text-xs">
          {message}
        </p>
      )}
      {sessions.length === 0 && (
        <Card className="text-ink-300 flex flex-col gap-2 p-3 text-sm">
          <p>
            Aucune recherche enregistrée. Une recherche se démarre depuis la carte :{' '}
            <strong className="text-ink-100">
              Outils → Démarrer une recherche de sang
            </strong>
            . La caméra sang est accessible sans recherche (bouton ci-dessus, ou Outils →
            Caméra sang).
          </p>
          <Link
            to="/map"
            className="text-brand-400 inline-flex min-h-11 items-center font-medium underline"
          >
            Ouvrir la carte
          </Link>
        </Card>
      )}
      {sorted.map((session) => {
        const track = tracks.find((t) => t.id === session.trackId)
        const clues = sessionClues(waypoints, session.id)
        const activeMs = track ? trackActiveMs(track) : null
        const renaming = renamingId === session.id
        const confirming = deleting?.id === session.id
        return (
          <Card key={session.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between gap-2">
              {renaming ? (
                <form
                  className="flex min-w-0 flex-1 items-center gap-1"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void rename(session.id, draftName).then((done) => {
                      if (done) setRenamingId(null)
                    })
                  }}
                >
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    maxLength={80}
                    aria-label={`Nouveau nom de ${session.name}`}
                    className="border-surface-600 bg-surface-900 text-ink-100 min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-base"
                  />
                  <button type="submit" aria-label="Enregistrer le nom" className={BTN}>
                    <Check size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Annuler le renommage"
                    className={BTN}
                    onClick={() => setRenamingId(null)}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0">
                    <span className="text-ink-100 block truncate text-sm font-medium">
                      {session.name}
                    </span>
                    <span className="text-ink-500 block text-xs">
                      {new Date(session.createdAt).toLocaleDateString('fr-CA')} ·{' '}
                      {SESSION_STATUS_LABEL[session.status]}
                    </span>
                    <span className="text-ink-300 block text-xs">
                      Durée enregistrée :{' '}
                      {activeMs === null ? 'inconnue' : formatDuration(activeMs)} ·
                      Distance :{' '}
                      {track?.distanceMeters === undefined
                        ? 'inconnue'
                        : formatDistanceMeters(track.distanceMeters)}{' '}
                      · {clues.length} indice{clues.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Renommer ${session.name}`}
                    className={BTN}
                    onClick={() => {
                      setRenamingId(session.id)
                      setDraftName(session.name)
                    }}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-1">
              <button type="button" className={BTN} onClick={() => showOnMap(session.id)}>
                <MapIcon size={16} aria-hidden="true" /> Voir sur la carte
              </button>
              <button
                type="button"
                className={BTN}
                aria-expanded={openId === session.id}
                onClick={() => setOpenId(openId === session.id ? null : session.id)}
              >
                Chronologie
              </button>
              <button
                type="button"
                className={BTN}
                aria-label={`Exporter ${session.name} (GPX)`}
                onClick={() => void exportOne(session.id, false)}
              >
                <Download size={16} aria-hidden="true" /> GPX
              </button>
              <button
                type="button"
                className={BTN}
                aria-label={`Partager ${session.name}`}
                onClick={() => void exportOne(session.id, true)}
              >
                <Share2 size={16} aria-hidden="true" /> Partager
              </button>
              <button
                type="button"
                className={`${BTN} hover:text-status-danger`}
                aria-label={`Supprimer ${session.name}`}
                onClick={() => void askDelete(session.id)}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>

            {openId === session.id && (
              <ol className="text-ink-300 flex flex-col gap-1 text-xs">
                {clues.length === 0 && <li>Aucun indice enregistré.</li>}
                {clues.map((clue) => (
                  <li key={clue.id}>
                    {new Date(clue.createdAt).toLocaleTimeString('fr-CA', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    — {clue.name}
                    {clue.origin === 'manual' ? ' (placé à la main)' : ''}
                    {clue.coordinate.accuracyMeters !== undefined
                      ? ` · ±${Math.round(clue.coordinate.accuracyMeters)} m`
                      : ''}
                  </li>
                ))}
              </ol>
            )}

            {confirming && deleting && (
              <div
                role="alertdialog"
                aria-label={`Confirmer la suppression de ${session.name}`}
                className="border-status-danger/50 flex flex-col gap-2 rounded-lg border p-2 text-sm"
              >
                <p className="text-ink-100">
                  Cette recherche contient {deleting.counts.waypoints} point
                  {deleting.counts.waypoints > 1 ? 's' : ''} de repère,{' '}
                  {deleting.counts.photos} photo{deleting.counts.photos > 1 ? 's' : ''} et{' '}
                  {deleting.counts.tracks} trace{deleting.counts.tracks > 1 ? 's' : ''}.
                  Rien n’est supprimé sans votre choix :
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${BTN} border-surface-600 border`}
                    onClick={() => setDeleting(null)}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className={`${BTN} border-surface-600 border`}
                    onClick={() =>
                      void deleteSession(session.id, false).then(() => setDeleting(null))
                    }
                  >
                    Supprimer la recherche, garder trace et points
                  </button>
                  <button
                    type="button"
                    className={`${BTN} bg-status-danger/15 text-status-danger border-status-danger/50 border`}
                    onClick={() =>
                      void deleteSession(session.id, true).then(() => setDeleting(null))
                    }
                  >
                    Tout supprimer (trace, points, photos)
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
