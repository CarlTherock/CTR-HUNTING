import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Flashlight, ImagePlus, Pause, Play, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { useCameraStream } from '@/features/camera/useCameraStream'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { resolveMarkerPosition } from '../markerPosition'
import { useBloodStore } from '../state/bloodStore'
import {
  ANALYSIS_MAX_WIDTH,
  CAMERA_WARNING,
  DEFAULT_HIGHLIGHT_SETTINGS,
  LIGHTING_MESSAGE,
  analysisSize,
  analyzeCandidates,
  assessLighting,
  computeCandidateMask,
  hasCandidateZone,
  renderHighlight,
  shouldAlert,
  type HighlightSettings,
  type LightingIssue,
} from './bloodHighlight'

type ViewMode = 'filtered' | 'original' | 'split'

/** Longest side kept for a captured photo (the preview is much smaller). */
const CAPTURE_MAX_WIDTH = 1280
/** The loop runs at most this often: enough to follow a slow scan, light on a phone. */
const FRAME_INTERVAL_MS = 125

interface PendingCapture {
  /** `live`: frame of the camera stream. `import`: a photo picked from the
   * device — NOT the live view, and its place is not the photo's place. */
  source: 'live' | 'import'
  original: Blob
  processed: Blob
  originalUrl: string
  processedUrl: string
}

export interface BloodCameraAssistProps {
  /** The page's single shared GPS reading (no second watcher is started). */
  gpsReading: GeolocationReading
  onClose: () => void
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9),
  )
}

function supportsVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function supportsSound(): boolean {
  return typeof window !== 'undefined' && 'AudioContext' in window
}

/**
 * EXPERIMENTAL visual aid. Shows the live camera with candidate zones
 * (blood-like colours) highlighted, next to or instead of the original.
 * Processing is local; no image, note or position leaves the device. A
 * highlighted zone is never a confirmed clue and never creates a point by
 * itself: only « Confirmer un indice » does, and it reuses the normal « Sang »
 * waypoint creation of the open search session.
 */
export function BloodCameraAssist({ gpsReading, onClose }: BloodCameraAssistProps) {
  const { status, errorReason, stream, start, stop, torchSupported, torchOn, setTorch } =
    useCameraStream()
  const videoRef = useRef<HTMLVideoElement>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const workRef = useRef<HTMLCanvasElement | null>(null)
  const settingsRef = useRef<HighlightSettings>(DEFAULT_HIGHLIGHT_SETTINGS)
  const lastAlertRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const alertOptionsRef = useRef({ vibrate: false, sound: false })
  const startRef = useRef(start)
  const streamEndedRef = useRef<() => boolean>(() => false)

  const [settings, setSettings] = useState<HighlightSettings>(DEFAULT_HIGHLIGHT_SETTINGS)
  const [mode, setMode] = useState<ViewMode>('split')
  const [paused, setPaused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [zone, setZone] = useState(false)
  const [areaPercent, setAreaPercent] = useState(0)
  const [lighting, setLighting] = useState<LightingIssue>(null)
  const [vibrate, setVibrate] = useState(false)
  const [sound, setSound] = useState(false)
  const [capture, setCapture] = useState<PendingCapture | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsManual, setNeedsManual] = useState(false)
  // No open search: the user must choose explicitly before anything is created.
  const [gate, setGate] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const openSession = useBloodStore((state) =>
    state.sessions.find((session) => session.status !== 'finished'),
  )
  // The dialog steps aside so the map can be tapped to place the point.
  const [placing, setPlacing] = useState(false)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    startRef.current = start
    streamEndedRef.current = () =>
      status === 'streaming' &&
      !!stream &&
      stream.getVideoTracks().every((track) => track.readyState === 'ended')
  }, [start, status, stream])
  useEffect(() => {
    alertOptionsRef.current = { vibrate, sound }
  }, [vibrate, sound])

  // Start the camera on open; stop it (and the tracks) on close.
  useEffect(() => {
    void start()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  // Do not process while the page is hidden.
  useEffect(() => {
    function onVisibility() {
      const isHidden = document.visibilityState === 'hidden'
      setHidden(isHidden)
      // iOS may cut the camera while the app is in the background: ask for a
      // fresh stream when coming back instead of leaving a frozen image.
      if (!isHidden && streamEndedRef.current()) void startRef.current()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Release object URLs of a pending capture.
  useEffect(() => {
    return () => {
      if (capture) {
        URL.revokeObjectURL(capture.originalUrl)
        URL.revokeObjectURL(capture.processedUrl)
      }
    }
  }, [capture])

  const playAlert = useCallback(() => {
    const options = alertOptionsRef.current
    // No channel enabled: nothing to throttle (the visual alert is always on).
    if (!(options.vibrate && supportsVibration()) && !options.sound) return
    const now = Date.now()
    if (!shouldAlert(now, lastAlertRef.current)) return
    lastAlertRef.current = now
    if (options.vibrate && supportsVibration()) navigator.vibrate(120)
    if (options.sound && audioRef.current) {
      const context = audioRef.current
      const oscillator = context.createOscillator()
      oscillator.frequency.value = 880
      oscillator.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.12)
    }
  }, [])

  // Processing loop: small frames, throttled, stopped when paused / hidden /
  // a capture is being reviewed / on unmount. No frame is kept between ticks.
  const running = status === 'streaming' && !paused && !hidden && capture === null
  useEffect(() => {
    if (!running) return
    let frame = 0
    let cancelled = false
    let last = 0
    const tick = (time: number) => {
      if (cancelled) return
      frame = requestAnimationFrame(tick)
      if (time - last < FRAME_INTERVAL_MS) return
      last = time
      const video = videoRef.current
      const display = displayRef.current
      if (!video || !display || video.videoWidth === 0) return
      const { width, height } = analysisSize(
        video.videoWidth,
        video.videoHeight,
        ANALYSIS_MAX_WIDTH,
      )
      if (width === 0) return
      const work = (workRef.current ??= document.createElement('canvas'))
      if (work.width !== width || work.height !== height) {
        work.width = width
        work.height = height
      }
      const workCtx = work.getContext('2d', { willReadFrequently: true })
      const displayCtx = display.getContext('2d')
      if (!workCtx || !displayCtx) return
      workCtx.drawImage(video, 0, 0, width, height)
      const source = workCtx.getImageData(0, 0, width, height)
      const candidates = computeCandidateMask(source, settingsRef.current)
      const analysis = analyzeCandidates(candidates)
      const found = hasCandidateZone(analysis)
      setZone(found)
      setAreaPercent(Math.round(analysis.areaRatio * 1000) / 10)
      setLighting(assessLighting(source))
      if (found) playAlert()
      if (display.width !== width || display.height !== height) {
        display.width = width
        display.height = height
      }
      const rendered = renderHighlight(source, candidates, settingsRef.current)
      displayCtx.putImageData(new ImageData(rendered, width, height), 0, 0)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [running, playAlert])

  // Close the audio context with the component.
  useEffect(() => {
    return () => {
      void audioRef.current?.close()
      audioRef.current = null
    }
  }, [])

  function toggleSound(next: boolean) {
    if (next && !audioRef.current && supportsSound()) {
      // Created from the user's tap, as browsers require.
      audioRef.current = new window.AudioContext()
    }
    setSound(next)
  }

  async function buildCapture(
    drawable: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    origin: PendingCapture['source'],
  ) {
    setMessage(null)
    setError(null)
    const scale = Math.min(1, CAPTURE_MAX_WIDTH / sourceWidth)
    const width = Math.round(sourceWidth * scale)
    const height = Math.round(sourceHeight * scale)
    const originalCanvas = document.createElement('canvas')
    originalCanvas.width = width
    originalCanvas.height = height
    const ctx = originalCanvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(drawable, 0, 0, width, height)
    const source = ctx.getImageData(0, 0, width, height)
    // The processed copy is built from the same pixels; `source` (the
    // original) is never modified.
    const candidates = computeCandidateMask(source, settingsRef.current)
    const rendered = renderHighlight(source, candidates, settingsRef.current)
    const processedCanvas = document.createElement('canvas')
    processedCanvas.width = width
    processedCanvas.height = height
    processedCanvas
      .getContext('2d')
      ?.putImageData(new ImageData(rendered, width, height), 0, 0)
    const [original, processed] = await Promise.all([
      canvasToBlob(originalCanvas),
      canvasToBlob(processedCanvas),
    ])
    if (!original || !processed) {
      setError('Capture impossible : l’image n’a pas pu être produite.')
      return
    }
    setNote('')
    setNeedsManual(false)
    setGate(false)
    setCapture({
      source: origin,
      original,
      processed,
      originalUrl: URL.createObjectURL(original),
      processedUrl: URL.createObjectURL(processed),
    })
  }

  async function takeCapture() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    await buildCapture(video, video.videoWidth, video.videoHeight, 'live')
  }

  /** Fallback when the live camera is unavailable: a photo picked from the
   * device, analysed once. It is clearly labelled as imported. */
  async function importPhoto(file: File) {
    try {
      const bitmap = await createImageBitmap(file)
      await buildCapture(bitmap, bitmap.width, bitmap.height, 'import')
      bitmap.close?.()
    } catch {
      setError('Photo illisible : choisissez une image JPEG ou PNG.')
    }
  }

  async function saveClue(
    coordinate: {
      lat: number
      lng: number
      accuracyMeters?: number
      altitude?: number
    } | null,
  ) {
    if (!capture) return
    setBusy(true)
    setError(null)
    const store = useBloodStore.getState()
    let result
    if (coordinate) {
      result = await store.addMarker('blood', { coordinate, origin: 'gps' })
    } else {
      const manual = store.manual
      if (!manual?.coordinate) {
        setBusy(false)
        return
      }
      result = await store.addMarker('blood', {
        coordinate: manual.coordinate,
        origin: 'manual',
      })
    }
    if (!result.ok) {
      setBusy(false)
      setError(result.message)
      return
    }
    useBloodStore.setState({ manual: null })
    setPlacing(false)
    const attached = await store.attachClueMedia(result.waypoint.id, {
      note,
      photo: {
        processed: capture.processed,
        original: capture.original,
        coordinate: coordinate ?? undefined,
      },
    })
    setBusy(false)
    setCapture(null)
    setNeedsManual(false)
    setMessage(
      attached
        ? `${result.waypoint.name} enregistré avec la photo.`
        : `${result.waypoint.name} enregistré, mais la photo ou la note n’a pas pu être ajoutée.`,
    )
  }

  async function createSearchThenConfirm() {
    setBusy(true)
    setError(null)
    const position = resolveMarkerPosition(gpsReading, Date.now())
    // Explicit choice made on screen: this also starts the red track (or
    // waits for a usable GPS fix, which is announced below).
    const started = await useBloodStore
      .getState()
      .startSession({ hasUsableFix: position.kind === 'ready' })
    setBusy(false)
    if (!started.ok) {
      setError(started.message)
      return
    }
    setGate(false)
    confirmClue()
  }

  function confirmClue() {
    if (!useBloodStore.getState().openSession()) {
      setGate(true)
      return
    }
    const position = resolveMarkerPosition(gpsReading, Date.now())
    if (position.kind === 'ready') {
      void saveClue(position.coordinate)
      return
    }
    // No usable position: the point is placed by hand and only saved after
    // an explicit confirmation.
    useBloodStore.getState().startManual('blood')
    setNeedsManual(true)
  }

  const manual = useBloodStore((state) => state.manual)
  if (placing) {
    return (
      <div
        role="group"
        aria-label="Placement manuel de la capture"
        data-testid="camera-placing"
        className="bg-surface-900 text-ink-100 border-surface-600 fixed inset-x-2 bottom-2 z-50 flex flex-col gap-2 rounded-lg border p-3 text-sm shadow-xl"
      >
        <p>
          Touchez la carte pour placer le point. Il sera verrouillé à l’enregistrement.
        </p>
        {error && (
          <p role="alert" className="text-status-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="md"
            disabled={!manual?.coordinate || busy}
            onClick={() => void saveClue(null)}
          >
            Enregistrer avec la photo
          </Button>
          <Button variant="secondary" size="md" onClick={() => setPlacing(false)}>
            Retour à la capture
          </Button>
        </div>
      </div>
    )
  }
  const showFiltered = mode === 'filtered' || mode === 'split'
  const showOriginal = mode === 'original' || mode === 'split'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Caméra de recherche de sang (expérimental)"
      className="bg-surface-950 text-ink-100 fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      data-testid="blood-camera"
    >
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="text-sm font-semibold">
          Caméra de recherche <span className="text-status-warning">(expérimental)</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la caméra"
          className="flex h-11 w-11 items-center justify-center"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choisir une photo à analyser"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void importPhoto(file)
        }}
      />
      <p
        role="note"
        data-testid="camera-warning"
        className="border-status-warning/60 bg-surface-900 mx-2 rounded-lg border p-2 text-xs"
      >
        {CAMERA_WARNING}
      </p>

      {status === 'error' && (
        <div role="alert" className="text-status-danger p-3 text-sm">
          <p>{errorReason}</p>
          <p className="text-ink-300 mt-1">
            L’enregistrement de la trace et les points « + Sang » continuent de
            fonctionner sans la caméra.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="md" onClick={() => void start()}>
              <RefreshCw size={16} aria-hidden="true" /> Réessayer la caméra
            </Button>
            <Button variant="primary" size="md" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={16} aria-hidden="true" /> Importer une photo
            </Button>
          </div>
        </div>
      )}

      {capture ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
          <div className="grid grid-cols-2 gap-2">
            <figure>
              <img
                src={capture.originalUrl}
                alt="Photo originale"
                className="w-full rounded"
              />
              <figcaption className="text-ink-300 text-xs">
                Originale (intacte)
              </figcaption>
            </figure>
            <figure>
              <img
                src={capture.processedUrl}
                alt="Photo avec surbrillance"
                className="w-full rounded"
              />
              <figcaption className="text-ink-300 text-xs">Avec surbrillance</figcaption>
            </figure>
          </div>
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
            gate && (
              <div
                role="group"
                aria-label="Aucune recherche ouverte"
                data-testid="clue-gate"
                className="border-surface-600 flex flex-col gap-2 rounded-lg border p-2 text-sm"
              >
                <p>
                  Aucune recherche de sang n’est ouverte. Un indice doit être rattaché à
                  une recherche. Créer une recherche démarre aussi l’enregistrement de
                  votre trace GPS (ou l’attend si le GPS n’est pas prêt).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={busy}
                    onClick={() => void createSearchThenConfirm()}
                  >
                    Créer une recherche et démarrer ma trace
                  </Button>
                  <Button variant="secondary" size="md" onClick={() => setGate(false)}>
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
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="border-surface-600 bg-surface-900 mt-1 w-full rounded-lg border p-2 text-base"
            />
          </label>
          {needsManual && (
            <div
              role="group"
              aria-label="Placement manuel"
              className="border-surface-600 rounded-lg border p-2 text-sm"
            >
              <p>
                Position GPS indisponible ou trop ancienne : placez le point à la main sur
                la carte (ce ne sera pas la position du téléphone).
              </p>
              <Button
                className="mt-2"
                variant="primary"
                size="md"
                onClick={() => setPlacing(true)}
              >
                Placer sur la carte
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-status-danger text-sm">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" disabled={busy} onClick={confirmClue}>
              Confirmer un indice
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => {
                useBloodStore.getState().cancelManual()
                setCapture(null)
                setNeedsManual(false)
              }}
            >
              Écarter cette capture
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            className={`relative flex min-h-0 flex-1 gap-1 p-1 portrait:flex-col landscape:flex-row`}
          >
            <div
              className={
                showOriginal
                  ? 'relative min-h-0 min-w-0 flex-1'
                  : 'absolute h-px w-px overflow-hidden opacity-0'
              }
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                aria-label="Image originale de la caméra"
                className="h-full w-full object-contain"
              />
              {showOriginal && (
                <span className="bg-surface-950/80 absolute top-1 left-1 rounded px-1 text-xs">
                  Originale
                </span>
              )}
            </div>
            <div className={showFiltered ? 'relative min-h-0 min-w-0 flex-1' : 'hidden'}>
              <canvas
                ref={displayRef}
                aria-label="Image avec surbrillance des zones candidates"
                className="h-full w-full object-contain"
              />
              <span className="bg-surface-950/80 absolute top-1 left-1 rounded px-1 text-xs">
                Surbrillance
              </span>
            </div>
          </div>

          <div
            className="flex flex-col gap-2 overflow-y-auto p-2"
            style={{ maxHeight: '45%' }}
          >
            <div aria-live="polite" className="min-h-5 text-sm">
              {zone ? (
                <span
                  className="font-semibold text-yellow-300"
                  data-testid="candidate-alert"
                >
                  Zone candidate ({areaPercent} % de l’image) — à vérifier, non confirmée
                </span>
              ) : (
                <span className="text-ink-300">Aucune zone candidate dans l’image.</span>
              )}
            </div>
            {lighting && (
              <p role="status" className="text-status-warning text-xs">
                {LIGHTING_MESSAGE[lighting]}
              </p>
            )}
            {message && (
              <p role="status" className="text-xs">
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="text-status-danger text-xs">
                {error}
              </p>
            )}

            <div role="group" aria-label="Affichage" className="flex flex-wrap gap-2">
              {(
                [
                  ['split', 'Côte à côte'],
                  ['filtered', 'Filtrée'],
                  ['original', 'Originale'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={`min-h-11 rounded-lg border px-3 text-sm ${
                    mode === value
                      ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                      : 'border-surface-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs">
              Sensibilité
              <input
                type="range"
                min={0}
                max={100}
                value={settings.sensitivity}
                aria-label="Sensibilité"
                onChange={(event) =>
                  setSettings((s) => ({ ...s, sensitivity: Number(event.target.value) }))
                }
                className="accent-brand-500 flex-1"
              />
              <span className="w-8 tabular-nums">{settings.sensitivity}</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              Atténuation du fond
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(settings.backgroundAttenuation * 100)}
                aria-label="Atténuation du fond"
                onChange={(event) =>
                  setSettings((s) => ({
                    ...s,
                    backgroundAttenuation: Number(event.target.value) / 100,
                  }))
                }
                className="accent-brand-500 flex-1"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div
                role="group"
                aria-label="Couleur de surbrillance"
                className="flex gap-2"
              >
                {(
                  [
                    ['yellow', 'Jaune'],
                    ['cyan', 'Cyan'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={settings.highlightColor === value}
                    onClick={() => setSettings((s) => ({ ...s, highlightColor: value }))}
                    className={`min-h-11 rounded-lg border px-3 ${
                      settings.highlightColor === value
                        ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                        : 'border-surface-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.rustTones}
                  onChange={(event) =>
                    setSettings((s) => ({ ...s, rustTones: event.target.checked }))
                  }
                  className="h-5 w-5"
                />
                Tons foncés / rouille
              </label>
            </div>
            {settings.rustTones && (
              <p className="text-ink-300 text-xs">
                Les tons foncés / rouille surlignent aussi le sol, l’écorce et la rouille.
                Cela ne permet pas de retrouver du sang ancien.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={vibrate}
                  disabled={!supportsVibration()}
                  onChange={(event) => setVibrate(event.target.checked)}
                  className="h-5 w-5"
                />
                Vibration
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={sound}
                  disabled={!supportsSound()}
                  onChange={(event) => toggleSound(event.target.checked)}
                  className="h-5 w-5"
                />
                Son
              </label>
              {(!supportsVibration() || !supportsSound()) && (
                <span className="text-ink-300 text-xs">
                  {!supportsVibration() ? 'Vibration non prise en charge ici. ' : ''}
                  {!supportsSound() ? 'Son non pris en charge ici.' : ''}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {torchSupported ? (
                <Button
                  variant="secondary"
                  size="md"
                  aria-pressed={torchOn}
                  onClick={() => void setTorch(!torchOn)}
                >
                  <Flashlight size={16} aria-hidden="true" />{' '}
                  {torchOn ? 'Éteindre la lampe' : 'Allumer la lampe'}
                </Button>
              ) : (
                <span className="text-ink-300 text-xs">
                  Lampe de la caméra non disponible sur cet appareil/navigateur (un écran
                  blanc n’est pas une lampe et n’est pas proposé).
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="lg"
                aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}
              >
                {paused ? (
                  <Play size={18} aria-hidden="true" />
                ) : (
                  <Pause size={18} aria-hidden="true" />
                )}
                {paused ? 'Reprendre l’analyse' : 'Pause de l’analyse'}
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={status !== 'streaming'}
                onClick={() => void takeCapture()}
              >
                <Camera size={18} aria-hidden="true" /> Capturer
              </Button>
              {status !== 'error' && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={18} aria-hidden="true" /> Importer une photo
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
