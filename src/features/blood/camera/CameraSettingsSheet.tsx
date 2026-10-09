import { ImagePlus, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/utils/cn'
import { HIGHLIGHT_COLOR_OPTIONS, type HighlightSettings } from './bloodHighlight'
import { CameraSheet } from './CameraSheet'

export interface CameraSettingsSheetProps {
  settings: HighlightSettings
  onSettings: (patch: Partial<HighlightSettings>) => void
  vibrate: boolean
  onVibrate: (value: boolean) => void
  sound: boolean
  onSound: (value: boolean) => void
  vibrationSupported: boolean
  soundSupported: boolean
  paused: boolean
  onTogglePause: () => void
  onImport: () => void
  onReset: () => void
  onClose: () => void
}

/** Every adjustment lives here, so the image stays free. The sheet is
 * scrollable and its close button is always reachable. */
export function CameraSettingsSheet(props: CameraSettingsSheetProps) {
  const { settings, onSettings } = props
  return (
    <CameraSheet
      label="Paramètres de la caméra"
      title="Paramètres"
      onClose={props.onClose}
      testId="camera-settings"
    >
      <label className="flex items-center gap-3 text-sm">
        <span className="w-28 shrink-0">Sensibilité</span>
        <input
          type="range"
          min={0}
          max={100}
          value={settings.sensitivity}
          aria-label="Sensibilité"
          onChange={(event) => onSettings({ sensitivity: Number(event.target.value) })}
          className="accent-brand-500 h-11 flex-1"
        />
        <span className="w-8 text-right tabular-nums">{settings.sensitivity}</span>
      </label>
      <label className="flex items-center gap-3 text-sm">
        <span className="w-28 shrink-0">Atténuation du fond</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.backgroundAttenuation * 100)}
          aria-label="Atténuation du fond"
          onChange={(event) =>
            onSettings({ backgroundAttenuation: Number(event.target.value) / 100 })
          }
          className="accent-brand-500 h-11 flex-1"
        />
        <span className="w-8 text-right tabular-nums">
          {Math.round(settings.backgroundAttenuation * 100)}
        </span>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-sm">Couleur de surbrillance</span>
        <div
          role="group"
          aria-label="Couleur de surbrillance"
          className="grid grid-cols-4 gap-2"
        >
          {HIGHLIGHT_COLOR_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={settings.highlightColor === option.value}
              onClick={() => onSettings({ highlightColor: option.value })}
              className={cn(
                'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-1 text-sm',
                settings.highlightColor === option.value
                  ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                  : 'border-surface-600',
              )}
            >
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/60"
                style={{ backgroundColor: option.swatch }}
              />
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-ink-300 text-xs">
          La couleur change l’affichage seulement : les zones candidates sont les mêmes.
          {settings.highlightColor === 'red'
            ? ' Le rouge se distingue moins sur une tache déjà rouge ; l’atténuation du fond aide.'
            : ''}
        </p>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.rustTones}
          onChange={(event) => onSettings({ rustTones: event.target.checked })}
          className="h-5 w-5"
        />
        Tons foncés / rouille
      </label>
      {settings.rustTones && (
        <p className="text-ink-300 text-xs">
          Les tons foncés / rouille surlignent aussi le sol, l’écorce et la rouille. Cela
          ne permet pas de retrouver du sang ancien.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.sound}
            disabled={!props.soundSupported}
            onChange={(event) => props.onSound(event.target.checked)}
            className="h-5 w-5"
          />
          Son
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.vibrate}
            disabled={!props.vibrationSupported}
            onChange={(event) => props.onVibrate(event.target.checked)}
            className="h-5 w-5"
          />
          Vibration
        </label>
        <p className="text-ink-300 text-xs" data-testid="alert-compat">
          {props.vibrationSupported
            ? 'Vibration disponible sur cet appareil.'
            : 'Vibration non prise en charge ici.'}{' '}
          {props.soundSupported ? '' : 'Son non pris en charge ici.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="md"
          aria-pressed={props.paused}
          onClick={props.onTogglePause}
        >
          {props.paused ? (
            <Play size={16} aria-hidden="true" />
          ) : (
            <Pause size={16} aria-hidden="true" />
          )}
          {props.paused ? 'Reprendre l’analyse' : 'Pause de l’analyse'}
        </Button>
        <Button variant="secondary" size="md" onClick={props.onImport}>
          <ImagePlus size={16} aria-hidden="true" /> Importer une photo
        </Button>
        <Button variant="secondary" size="md" onClick={props.onReset}>
          <RotateCcw size={16} aria-hidden="true" /> Réinitialiser les réglages
        </Button>
      </div>
    </CameraSheet>
  )
}
