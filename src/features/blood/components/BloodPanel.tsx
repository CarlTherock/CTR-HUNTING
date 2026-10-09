import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Camera,
  Droplets,
  Eye,
  Navigation,
  Pause,
  Play,
  Square,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { gpsFreshness } from '@/features/gps/gpsFreshness'
import { useGpsClock } from '@/features/gps/useGpsClock'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useRecordingWakeLock } from '@/features/waypoints/useRecordingWakeLock'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { formatDistanceMeters, formatDuration, formatNumberFr } from '@/utils/format'
import type { BloodMarkerKind, Coordinate } from '@/types'
import { resolveMarkerPosition } from '../markerPosition'
import {
  BLOOD_MARKER_LABEL,
  QUICK_MARKER_KINDS,
  SESSION_STATUS_LABEL,
  clueLinkPaths,
  lastBloodClue,
  lastClue,
  sessionClues,
} from '../sessionLogic'
import { useBloodStore } from '../state/bloodStore'

interface BloodPanelProps {
  gpsReading: GeolocationReading
  onCenter: (coordinate: Coordinate) => void
  /** Bird's-eye view of the session: fits the given positions on screen. */
  onOverview: (coordinates: Coordinate[]) => void
}

const SECONDARY =
  'flex min-h-11 items-center gap-2 rounded-lg border border-surface-600 px-3 text-left text-sm text-ink-100 hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-50'

function ElapsedSince({ iso }: { iso: string }) {
  const now = useGpsClock(1000)
  return (
    <span className="tabular-nums">
      {formatDuration(Math.max(0, now - Date.parse(iso)))}
    </span>
  )
}

/** Field panel of an open blood-search session: the big « + Sang » button,
 * pause / resume / finish, and (collapsible) last-clue shortcuts, quick
 * markers and undo. Stays compact and scrolls inside itself so the map and
 * the essential controls remain reachable on small and landscape screens. */
export function BloodPanel({ gpsReading, onCenter, onOverview }: BloodPanelProps) {
  const sessions = useBloodStore((state) => state.sessions)
  const session = sessions.find((s) => s.status !== 'finished') ?? null
  const showLinks = useBloodStore((state) => state.showLinks)
  const setShowLinks = useBloodStore((state) => state.setShowLinks)
  const manual = useBloodStore((state) => state.manual)
  const lastAddedId = useBloodStore((state) => state.lastAddedId)
  const trackStatus = useTracksStore((state) => state.status)
  const recordingId = useTracksStore((state) => state.recordingId)
  const recordingKind = useTracksStore((state) => state.recordingKind)
  const recordingStartedAt = useTracksStore((state) => state.recordingStartedAt)
  const distanceMeters = useTracksStore((state) => state.distanceMeters)
  const persistError = useTracksStore((state) => state.persistError)
  const waypoints = useWaypointsStore((state) => state.waypoints)
  const startGuidance = useGuidanceStore((state) => state.start)
  const now = useGpsClock(5000)
  const wakeLock = useRecordingWakeLock(
    trackStatus === 'recording' && recordingKind === 'blood',
  )

  const [expanded, setExpanded] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsFallback, setNeedsFallback] = useState<BloodMarkerKind | null>(null)
  const [undoWarning, setUndoWarning] = useState(false)
  const [busy, setBusy] = useState(false)
  const cameraOpen = useBloodStore((state) => state.cameraOpen)
  const openCamera = useBloodStore((state) => state.openCamera)

  const clues = useMemo(
    () => (session ? sessionClues(waypoints, session.id) : []),
    [waypoints, session],
  )
  const lastBlood = lastBloodClue(clues)
  const latest = lastClue(clues)

  // A session waiting for GPS starts recording as soon as a usable fix exists.
  const usableFix = resolveMarkerPosition(gpsReading, now).kind === 'ready'
  useEffect(() => {
    if (session?.status === 'waiting_gps' && usableFix) {
      void useBloodStore.getState().onUsableFix()
    }
  }, [session?.status, usableFix])

  if (!session) return null

  const interrupted =
    (session.status === 'active' || session.status === 'paused') &&
    session.trackId !== undefined &&
    recordingId !== session.trackId
  const gpsAge =
    gpsReading.status === 'available'
      ? gpsFreshness(now, gpsReading.value.timestampMs)
      : null

  async function press(kind: BloodMarkerKind) {
    if (busy) return
    setError(null)
    setNotice(null)
    const position = resolveMarkerPosition(gpsReading, Date.now())
    if (position.kind === 'unavailable') {
      setNeedsFallback(kind)
      return
    }
    setBusy(true)
    const result = await useBloodStore
      .getState()
      .addMarker(kind, { coordinate: position.coordinate, origin: 'gps' })
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setNeedsFallback(null)
    const accuracy = position.coordinate.accuracyMeters
    const flags: string[] = []
    if (position.lowAccuracy) {
      flags.push(
        `précision ${
          accuracy === undefined ? 'inconnue' : `faible (±${Math.round(accuracy)} m)`
        }`,
      )
    }
    if (position.freshness === 'old') flags.push('position GPS un peu ancienne')
    setNotice(
      flags.length > 0
        ? `${result.waypoint.name} enregistré — ${flags.join(', ')}.`
        : `${result.waypoint.name} enregistré.`,
    )
  }

  async function confirmManual() {
    setBusy(true)
    const result = await useBloodStore.getState().confirmManual()
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setError(null)
    setNotice(`${result.waypoint.name} enregistré (placé à la main).`)
  }

  async function undo() {
    const info = await useBloodStore.getState().undoInfo()
    if (!info) return
    if (info.hasExtras && !undoWarning) {
      setUndoWarning(true)
      return
    }
    setUndoWarning(false)
    await useBloodStore.getState().undoLast()
    setNotice('Dernier ajout annulé.')
  }

  function goTo(id: string) {
    startGuidance(id)
  }

  const gpsLine =
    gpsReading.status !== 'available'
      ? 'Position GPS indisponible.'
      : gpsAge === 'stale'
        ? 'Position GPS trop ancienne.'
        : gpsAge === 'old'
          ? 'Position GPS un peu ancienne.'
          : null

  return (
    <section
      aria-label="Recherche de sang"
      data-testid="blood-panel"
      className="border-surface-600 bg-surface-900/95 text-ink-100 pointer-events-auto flex max-h-[min(60dvh,28rem)] w-full flex-col gap-2 overflow-y-auto rounded-lg border p-2 text-sm shadow-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 font-semibold">
          <Droplets size={16} aria-hidden="true" className="text-[#dc2626]" />
          {session.name}
        </span>
        <span
          data-testid="blood-status"
          className={session.status === 'active' ? 'text-status-danger' : 'text-ink-300'}
        >
          {SESSION_STATUS_LABEL[session.status]}
        </span>
        <span className="text-ink-300 text-xs [@media(max-height:480px)]:hidden">
          {recordingStartedAt && recordingId === session.trackId ? (
            <ElapsedSince iso={recordingStartedAt} />
          ) : null}{' '}
          {recordingId === session.trackId ? formatDistanceMeters(distanceMeters) : ''} ·{' '}
          {clues.length} indice{clues.length > 1 ? 's' : ''}
        </span>
      </div>

      {session.status === 'waiting_gps' && (
        <div className="border-surface-600 rounded-lg border p-2">
          <p>
            En attente du GPS : aucun point n’est enregistré tant qu’aucune position
            utilisable n’est reçue. L’attente n’est pas comptée comme un déplacement.
          </p>
          <Button
            className="mt-2"
            variant="secondary"
            size="md"
            onClick={() => void useBloodStore.getState().cancelWaiting(session.id)}
          >
            Annuler la recherche
          </Button>
        </div>
      )}

      {interrupted && (
        <div role="alert" className="border-surface-600 rounded-lg border p-2">
          <p>
            Cette recherche a été interrompue (application fermée ou écran verrouillé). Le
            trajet enregistré est conservé ; la période non observée n’est pas reliée.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="md"
              onClick={() => void useBloodStore.getState().resumeInterrupted(session.id)}
            >
              Reprendre la recherche
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => void useBloodStore.getState().finish(session.id)}
            >
              Terminer la recherche
            </Button>
          </div>
        </div>
      )}

      {manual && !cameraOpen ? (
        <div
          className="border-surface-600 rounded-lg border p-2"
          role="group"
          aria-label="Placement manuel"
        >
          <p>
            {BLOOD_MARKER_LABEL[manual.kind]} : touchez la carte pour placer le point. Ce
            sera la position choisie à la main, pas celle du téléphone.
          </p>
          {manual.coordinate && (
            <p className="text-ink-300 mt-1 tabular-nums">
              {formatNumberFr(manual.coordinate.lat, 5)},{' '}
              {formatNumberFr(manual.coordinate.lng, 5)}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              variant="primary"
              size="md"
              disabled={!manual.coordinate || busy}
              onClick={() => void confirmManual()}
            >
              Enregistrer
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={() => useBloodStore.getState().cancelManual()}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : needsFallback && !cameraOpen ? (
        <div className="border-surface-600 rounded-lg border p-2" role="alert">
          <p>
            {gpsLine ?? 'Position GPS indisponible.'} Le point ne peut pas être placé à la
            position du téléphone.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={() => setNeedsFallback(null)}>
              Attendre le GPS
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                useBloodStore.getState().startManual(needsFallback)
                setNeedsFallback(null)
              }}
            >
              Placer à la main
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-stretch gap-2 [@media(max-height:480px)]:flex-nowrap">
        <button
          type="button"
          onClick={() => void press('blood')}
          disabled={busy || session.status === 'finished'}
          className="flex min-h-14 min-w-full flex-1 items-center justify-center gap-2 rounded-lg bg-[#dc2626] px-4 text-lg font-bold whitespace-nowrap text-white outline outline-2 outline-white/80 disabled:opacity-60 min-[480px]:min-w-[8rem] [@media(max-height:480px)]:min-h-11 [@media(max-height:480px)]:min-w-0 [@media(max-height:480px)]:text-base"
        >
          <Droplets size={22} aria-hidden="true" className="shrink-0" />+ Sang
        </button>
        {session.status === 'paused' ? (
          <Button
            variant="secondary"
            size="md"
            aria-label="Reprendre la recherche"
            onClick={() => void useBloodStore.getState().resume()}
          >
            <Play size={18} aria-hidden="true" />
            <span className="[@media(max-height:480px)]:sr-only">Reprendre</span>
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="md"
            aria-label="Mettre la recherche en pause"
            disabled={session.status !== 'active' || interrupted}
            onClick={() => void useBloodStore.getState().pause()}
          >
            <Pause size={18} aria-hidden="true" />
            <span className="[@media(max-height:480px)]:sr-only">Pause</span>
          </Button>
        )}
        <Button
          variant="secondary"
          size="md"
          aria-label="Terminer la recherche"
          disabled={session.status === 'waiting_gps'}
          onClick={() => void useBloodStore.getState().finish()}
        >
          <Square size={18} aria-hidden="true" />
          <span className="[@media(max-height:480px)]:sr-only">Terminer</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`${SECONDARY} justify-center px-2`}
          onClick={openCamera}
        >
          <Camera size={16} aria-hidden="true" /> Caméra sang
        </button>
        <button
          type="button"
          className={`${SECONDARY} justify-center px-2`}
          disabled={!latest}
          onClick={() => latest && goTo(latest.id)}
        >
          <Navigation size={16} aria-hidden="true" /> Dernier indice
        </button>
      </div>

      <div aria-live="polite" className="min-h-4 text-xs empty:hidden">
        {notice}
      </div>
      {error && (
        <p role="alert" className="text-status-danger text-xs">
          {error}
        </p>
      )}
      {persistError && (
        <p role="alert" className="text-status-danger text-xs">
          {persistError}
        </p>
      )}
      {gpsLine && !needsFallback && <p className="text-ink-300 text-xs">{gpsLine}</p>}

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className={`${SECONDARY} justify-between`}
      >
        <span>Indices et outils</span>
        {expanded ? (
          <ChevronUp size={16} aria-hidden="true" />
        ) : (
          <ChevronDown size={16} aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={SECONDARY}
              disabled={!lastBlood}
              onClick={() => lastBlood && goTo(lastBlood.id)}
            >
              <Navigation size={16} aria-hidden="true" /> Revenir au dernier sang
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={gpsReading.status !== 'available'}
              onClick={() =>
                gpsReading.status === 'available' && onCenter(gpsReading.value)
              }
            >
              <Crosshair size={16} aria-hidden="true" /> Recentrer sur ma position
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={clues.length === 0}
              onClick={() => onOverview(clues.map((c) => c.coordinate))}
            >
              <Eye size={16} aria-hidden="true" /> Vue d’ensemble
            </button>
          </div>

          <div>
            <p className="text-ink-300 mb-1 text-xs">Marqueurs rapides</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_MARKER_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className={SECONDARY}
                  disabled={busy}
                  onClick={() => void press(kind)}
                >
                  {BLOOD_MARKER_LABEL[kind]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={SECONDARY}
            disabled={!lastAddedId}
            onClick={() => void undo()}
          >
            <Undo2 size={16} aria-hidden="true" /> Annuler le dernier ajout
          </button>
          {undoWarning && (
            <div
              role="alert"
              className="border-surface-600 rounded-lg border p-2 text-xs"
            >
              <p>
                Une note ou une photo a été ajoutée à ce point : elle sera supprimée avec
                lui.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="danger" size="md" onClick={() => void undo()}>
                  Supprimer quand même
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setUndoWarning(false)}
                >
                  Garder
                </Button>
              </div>
            </div>
          )}

          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showLinks}
              onChange={(event) => setShowLinks(event.target.checked)}
              className="h-5 w-5"
            />
            Liaison entre indices
          </label>
          {showLinks && (
            <p className="text-ink-300 text-xs">
              Légende : trait rouge = mon déplacement ; tirets sombres = liaison entre
              deux indices consécutifs (aide visuelle, ce n’est pas le trajet de
              l’animal). {clueLinkPaths(clues).length} liaison(s).
            </p>
          )}
          <p className="text-ink-500 text-xs">
            {wakeLock === 'held'
              ? 'Écran maintenu allumé pendant l’enregistrement.'
              : 'Gardez l’application ouverte et l’écran allumé : sur iPhone, le GPS s’arrête quand l’écran se verrouille.'}
          </p>
        </div>
      )}
    </section>
  )
}
