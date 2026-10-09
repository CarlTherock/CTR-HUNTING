import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { useCameraStream } from '@/features/camera/useCameraStream'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { cn } from '@/utils/cn'
import { useBloodStore } from '../state/bloodStore'
import {
  ANALYSIS_MAX_WIDTH,
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
import { buildCapture } from './buildCapture'
import { CameraHelpSheet } from './CameraHelpSheet'
import { CameraMarkSheet } from './CameraMarkSheet'
import { CameraOverlay } from './CameraOverlay'
import { CameraSettingsSheet } from './CameraSettingsSheet'
import { CameraStage } from './CameraStage'
import { CaptureReview } from './CaptureReview'
import {
  DEFAULT_CAMERA_PREFS,
  loadPrefs,
  savePrefs,
  type CameraPrefs,
  type ViewMode,
} from './cameraPrefs'
import { useCameraClue, type PendingCapture } from './useCameraClue'

/** The loop runs at most this often: enough to follow a slow scan, light on a phone. */
const FRAME_INTERVAL_MS = 125

type Sheet = 'settings' | 'help' | 'mark' | null

export interface BloodCameraAssistProps {
  /** The page's single shared GPS reading (no second watcher is started). */
  gpsReading: GeolocationReading
  onClose: () => void
}

function supportsVibration(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

function supportsSound(): boolean {
  return typeof window !== 'undefined' && 'AudioContext' in window
}

/**
 * EXPERIMENTAL visual aid, as an immersive field screen: the image covers the
 * whole surface and the controls float over it. Candidate zones (blood-like
 * colours) are highlighted; processing is local and nothing leaves the device.
 * A highlighted zone is never a confirmed clue and never creates a point by
 * itself: only « Confirmer un indice » / « + Repère » do, through the normal
 * waypoint engine. The analysis resolution is independent of the display size.
 */
export function BloodCameraAssist({ gpsReading, onClose }: BloodCameraAssistProps) {
  const { status, errorReason, stream, start, stop, torchSupported, torchOn, setTorch } =
    useCameraStream()
  const videoRef = useRef<HTMLVideoElement>(null)
  const displayRef = useRef<HTMLCanvasElement>(null)
  const workRef = useRef<HTMLCanvasElement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastAlertRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const startRef = useRef(start)
  const streamEndedRef = useRef<() => boolean>(() => false)

  const [prefs, setPrefs] = useState<CameraPrefs>(loadPrefs)
  const settings = prefs.highlight
  const settingsRef = useRef<HighlightSettings>(settings)
  const alertOptionsRef = useRef({ vibrate: prefs.vibrate, sound: prefs.sound })
  const [sheet, setSheet] = useState<Sheet>(null)
  const [paused, setPaused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [zone, setZone] = useState(false)
  const [areaPercent, setAreaPercent] = useState(0)
  const [lighting, setLighting] = useState<LightingIssue>(null)
  const [capture, setCapture] = useState<PendingCapture | null>(null)
  const [kept, setKept] = useState<PendingCapture | null>(null)
  const [note, setNote] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [torchRefused, setTorchRefused] = useState(false)

  const onSaved = useCallback((_: unknown, message: string) => {
    setCapture(null)
    setKept(null)
    setNote('')
    setSheet(null)
    setNotice(message)
  }, [])
  const flow = useCameraClue(gpsReading, onSaved)
  const placing = flow.placing

  // Settings persist between openings (this device only).
  useEffect(() => {
    settingsRef.current = prefs.highlight
    alertOptionsRef.current = { vibrate: prefs.vibrate, sound: prefs.sound }
    savePrefs(prefs)
  }, [prefs])
  useEffect(() => {
    startRef.current = start
    streamEndedRef.current = () =>
      status === 'streaming' &&
      !!stream &&
      stream.getVideoTracks().every((track) => track.readyState === 'ended')
  }, [start, status, stream])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

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

  // Back from the map: the same stream is resumed (never a second one).
  useEffect(() => {
    if (!placing) void videoRef.current?.play?.()?.catch(() => undefined)
  }, [placing])

  // Release object URLs of a replaced / dropped capture.
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
  // a capture is being reviewed / the map is in use / on unmount. One loop
  // only; no frame is kept between ticks.
  const running =
    status === 'streaming' && !paused && !hidden && capture === null && !placing
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

  function ensureAudio() {
    // Created from a user's tap, as browsers require.
    if (!audioRef.current && supportsSound()) audioRef.current = new window.AudioContext()
  }

  function patchPrefs(patch: Partial<CameraPrefs>) {
    setPrefs((current) => ({ ...current, ...patch }))
  }
  function patchHighlight(patch: Partial<HighlightSettings>) {
    setPrefs((current) => ({ ...current, highlight: { ...current.highlight, ...patch } }))
  }
  function setSound(value: boolean) {
    if (value) ensureAudio()
    patchPrefs({ sound: value })
  }

  async function toggleTorch() {
    if (!torchSupported) {
      // Nothing was tried: the track does not declare a torch.
      setNotice(
        'Lampe non détectée : la caméra de cet appareil ou de ce navigateur ne déclare pas de lampe. Rien n’est simulé (un écran blanc n’est pas une lampe).',
      )
      return
    }
    const wanted = !torchOn
    const ok = await setTorch(wanted)
    setTorchRefused(!ok)
    // On failure the state is left as it was: never a lit icon without light.
    if (!ok) {
      setNotice(
        `Lampe détectée, mais la commande « ${wanted ? 'allumer' : 'éteindre'} » a été refusée par l’appareil : elle reste ${torchOn ? 'allumée' : 'éteinte'}.`,
      )
    }
  }

  async function takeCapture() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    await finishCapture(
      await buildCapture(
        video,
        video.videoWidth,
        video.videoHeight,
        'live',
        settingsRef.current,
      ),
    )
  }

  /** Fallback when the live camera is unavailable: a photo picked from the
   * device, analysed once. It is clearly labelled as imported. */
  async function importPhoto(file: File) {
    try {
      const bitmap = await createImageBitmap(file)
      const built = await buildCapture(
        bitmap,
        bitmap.width,
        bitmap.height,
        'import',
        settingsRef.current,
      )
      bitmap.close?.()
      await finishCapture(built)
    } catch {
      setError('Photo illisible : choisissez une image JPEG ou PNG.')
    }
  }

  async function finishCapture(built: PendingCapture | null) {
    setNotice(null)
    if (!built) {
      setError('Capture impossible : l’image n’a pas pu être produite.')
      return
    }
    setError(null)
    setNote('')
    flow.reset()
    setSheet(null)
    setKept(null)
    setCapture(built)
  }

  function confirmCapture() {
    if (!capture) return
    flow.submit({ kind: 'blood', note, photo: capture })
  }

  function keepCapture() {
    if (!capture) return
    flow.reset()
    setKept(capture)
    setCapture(null)
    setNotice('Capture gardée : joignez-la depuis « + Repère » si vous le voulez.')
  }

  function discardCapture() {
    useBloodStore.getState().cancelManual()
    flow.reset()
    setCapture(null)
  }

  function openSheet(next: Exclude<Sheet, null>) {
    setSheet((current) => (current === next ? null : next))
  }

  const lightingMessage = lighting ? LIGHTING_MESSAGE[lighting] : null
  const manualCoordinate = useBloodStore((state) => state.manual?.coordinate)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Caméra de recherche de sang (expérimental)"
      data-testid="blood-camera"
      onPointerDown={() => {
        if (prefs.sound) ensureAudio()
      }}
      // While the map is used to place a point, the dialog lets touches through
      // and shows nothing; the video element stays mounted (same stream).
      className={cn(
        'text-ink-100 fixed inset-0 z-50 overflow-hidden',
        placing ? 'pointer-events-none' : 'bg-black',
      )}
    >
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
      <div
        className={cn('absolute inset-0', placing && 'invisible')}
        aria-hidden={placing}
      >
        <CameraStage
          videoRef={videoRef}
          displayRef={displayRef}
          mode={prefs.mode}
          divider={prefs.divider}
          onDivider={(divider) => patchPrefs({ divider })}
        />
        <CameraOverlay
          status={status}
          errorReason={errorReason}
          onClose={onClose}
          torch={{ supported: torchSupported, on: torchOn, refused: torchRefused }}
          onTorch={() => void toggleTorch()}
          onSettings={() => openSheet('settings')}
          onHelp={() => openSheet('help')}
          mode={prefs.mode}
          onMode={(mode: ViewMode) => patchPrefs({ mode })}
          onCapture={() => void takeCapture()}
          onMark={() => openSheet('mark')}
          onRetry={() => void start()}
          onImport={() => fileRef.current?.click()}
          zone={zone}
          areaPercent={areaPercent}
          paused={paused}
          lightingMessage={lightingMessage}
          notice={notice}
          error={error}
          sheetOpen={sheet !== null}
        />
        {sheet === 'settings' && (
          <CameraSettingsSheet
            settings={settings}
            onSettings={patchHighlight}
            vibrate={prefs.vibrate}
            onVibrate={(vibrate) => patchPrefs({ vibrate })}
            sound={prefs.sound}
            onSound={setSound}
            vibrationSupported={supportsVibration()}
            soundSupported={supportsSound()}
            paused={paused}
            onTogglePause={() => setPaused((value) => !value)}
            onImport={() => fileRef.current?.click()}
            onReset={() => {
              setPrefs({
                ...DEFAULT_CAMERA_PREFS,
                divider: prefs.divider,
                mode: prefs.mode,
              })
              setNotice('Réglages réinitialisés.')
            }}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet === 'help' && <CameraHelpSheet onClose={() => setSheet(null)} />}
        {sheet === 'mark' && (
          <CameraMarkSheet
            gpsReading={gpsReading}
            flow={flow}
            kept={kept}
            onClose={() => {
              flow.reset()
              setSheet(null)
            }}
          />
        )}
        {capture && (
          <CaptureReview
            capture={capture}
            flow={flow}
            note={note}
            onNote={setNote}
            onConfirm={confirmCapture}
            onKeep={keepCapture}
            onDiscard={discardCapture}
          />
        )}
      </div>

      {placing && !flow.editorOpen && (
        <div
          role="group"
          aria-label="Placement manuel"
          data-testid="camera-placing"
          className="bg-surface-900 text-ink-100 border-surface-600 pointer-events-auto absolute inset-x-2 bottom-2 flex flex-col gap-2 rounded-lg border p-3 text-sm shadow-xl"
          style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        >
          <p>
            Caméra en pause. Touchez la carte pour placer le point : il est placé à la
            main, pas à la position du téléphone, et verrouillé à l’enregistrement.
          </p>
          {flow.error && (
            <p role="alert" className="text-status-danger">
              {flow.error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {flow.kind === 'blood' && (
              <Button
                variant="primary"
                size="md"
                disabled={!manualCoordinate || flow.busy}
                onClick={() => void flow.confirmManual()}
              >
                {flow.hasPhoto ? 'Enregistrer avec la photo' : 'Enregistrer l’indice ici'}
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={flow.cancelPlacing}>
              Retour à la caméra
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
