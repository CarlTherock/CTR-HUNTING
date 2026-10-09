import type { ReactNode } from 'react'
import {
  Camera,
  Flashlight,
  FlashlightOff,
  ImagePlus,
  Info,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { CAMERA_WARNING_SHORT } from './bloodHighlight'
import type { ViewMode } from './cameraPrefs'

/** Short landscape (phone on its side): the controls take one row. */
const SHORT = '[@media(max-height:480px)]'

const ROUND =
  'pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm active:bg-black/75'

const VIEW_OPTIONS: readonly { value: ViewMode; label: string }[] = [
  { value: 'filtered', label: 'Filtrée' },
  { value: 'original', label: 'Originale' },
  { value: 'split', label: 'Comparaison' },
]

export interface CameraOverlayProps {
  status: 'idle' | 'starting' | 'streaming' | 'error'
  errorReason: string | null
  onClose: () => void
  torch: { supported: boolean; on: boolean }
  onTorch: () => void
  onSettings: () => void
  onHelp: () => void
  mode: ViewMode
  onMode: (mode: ViewMode) => void
  onCapture: () => void
  onMark: () => void
  onRetry: () => void
  onImport: () => void
  zone: boolean
  areaPercent: number
  paused: boolean
  lightingMessage: string | null
  /** Short confirmation / explanation (torch, saved clue…). */
  notice: string | null
  error: string | null
  /** A sheet is open: its own close button is the way out. */
  sheetOpen: boolean
}

/**
 * Controls floating over the image. The layer itself ignores touches (the
 * image stays visible and nothing else is blocked); each control opts in.
 * Safe-area insets are applied here once, with a minimum margin, and nowhere
 * else: the image goes to the edges, the buttons stay inside the usable area.
 */
export function CameraOverlay(props: CameraOverlayProps): ReactNode {
  const { torch } = props
  const torchLabel = !torch.supported
    ? 'Lampe indisponible sur cet appareil'
    : torch.on
      ? 'Éteindre la lampe'
      : 'Allumer la lampe'
  return (
    <div
      data-testid="camera-overlay"
      className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between gap-2"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Fermer la caméra"
            className={ROUND}
          >
            <X size={22} aria-hidden="true" />
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onTorch}
              aria-label={torchLabel}
              aria-pressed={torch.supported ? torch.on : undefined}
              aria-disabled={!torch.supported}
              data-testid="camera-torch"
              className={cn(
                ROUND,
                torch.on && torch.supported && 'bg-amber-400 text-black ring-amber-200',
                !torch.supported && 'text-white/60',
              )}
            >
              {torch.supported ? (
                <Flashlight size={20} aria-hidden="true" />
              ) : (
                <FlashlightOff size={20} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={props.onSettings}
              aria-label="Paramètres"
              aria-haspopup="dialog"
              className={ROUND}
            >
              <SlidersHorizontal size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={props.onHelp}
              aria-label="Aide et informations"
              aria-haspopup="dialog"
              className={ROUND}
            >
              <Info size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex max-w-[min(100%,22rem)] flex-col items-start gap-1 text-xs">
          <button
            type="button"
            onClick={props.onHelp}
            data-testid="camera-warning"
            aria-label={`${CAMERA_WARNING_SHORT} — ouvrir l’aide`}
            className="pointer-events-auto min-h-7 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-300/50"
          >
            {CAMERA_WARNING_SHORT}
          </button>
          {props.status === 'streaming' && (
            <p
              aria-live="polite"
              className="rounded bg-black/60 px-2 py-1 text-white"
              data-testid="camera-status"
            >
              {props.paused ? (
                <span className="text-white/80">Analyse en pause.</span>
              ) : props.zone ? (
                <span
                  className="font-semibold text-yellow-300"
                  data-testid="candidate-alert"
                >
                  Zone candidate ({props.areaPercent} % de l’image) — à vérifier, non
                  confirmée
                </span>
              ) : (
                <span className="text-white/80">Aucune zone candidate dans l’image.</span>
              )}
            </p>
          )}
          {props.lightingMessage && (
            <p role="status" className="rounded bg-black/60 px-2 py-1 text-amber-200">
              {props.lightingMessage}
            </p>
          )}
          {props.notice && (
            <p
              role="status"
              data-testid="camera-notice"
              className="rounded bg-black/70 px-2 py-1 text-white"
            >
              {props.notice}
            </p>
          )}
          {props.error && (
            <p role="alert" className="rounded bg-black/70 px-2 py-1 text-red-300">
              {props.error}
            </p>
          )}
        </div>
      </div>

      {props.status !== 'streaming' && (
        <div className="pointer-events-auto mx-auto flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-black/70 p-4 text-center text-sm text-white">
          {props.status === 'error' ? (
            <>
              <div role="alert" className="flex flex-col gap-1">
                <p className="text-red-300">{props.errorReason}</p>
                <p className="text-xs text-white/80">
                  L’enregistrement de la trace et les points « + Sang » continuent de
                  fonctionner sans la caméra.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={props.onRetry}
                  className="flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 ring-1 ring-white/40"
                >
                  <RefreshCw size={16} aria-hidden="true" /> Réessayer la caméra
                </button>
                <button
                  type="button"
                  onClick={props.onImport}
                  className="bg-brand-500 text-surface-950 flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold"
                >
                  <ImagePlus size={16} aria-hidden="true" /> Importer une photo
                </button>
              </div>
            </>
          ) : (
            <p role="status">Démarrage de la caméra…</p>
          )}
        </div>
      )}

      <div
        className={cn(
          'flex flex-col items-center gap-2',
          `${SHORT}:flex-row ${SHORT}:items-end ${SHORT}:justify-between`,
        )}
      >
        <div
          role="group"
          aria-label="Affichage"
          className="pointer-events-auto flex rounded-full bg-black/60 p-0.5 ring-1 ring-white/30 backdrop-blur-sm"
        >
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={props.mode === option.value}
              onClick={() => props.onMode(option.value)}
              className={cn(
                'min-h-11 rounded-full px-3 text-sm',
                props.mode === option.value
                  ? 'bg-white font-semibold text-black'
                  : 'text-white',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={props.onCapture}
            disabled={props.status !== 'streaming'}
            className="bg-brand-500 text-surface-950 pointer-events-auto flex min-h-14 items-center gap-2 rounded-full px-6 text-base font-bold shadow-lg ring-2 ring-white/70 disabled:opacity-50"
          >
            <Camera size={22} aria-hidden="true" /> Capturer
          </button>
          <button
            type="button"
            onClick={props.onMark}
            aria-haspopup="dialog"
            className="pointer-events-auto flex min-h-12 items-center gap-1 rounded-full bg-black/65 px-4 text-base font-semibold text-white ring-1 ring-white/50 backdrop-blur-sm"
          >
            + Repère
          </button>
        </div>
      </div>
    </div>
  )
}
