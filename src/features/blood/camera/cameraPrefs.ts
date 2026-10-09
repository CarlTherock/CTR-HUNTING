import {
  DEFAULT_HIGHLIGHT_SETTINGS,
  isHighlightColor,
  type HighlightSettings,
} from './bloodHighlight'

export type ViewMode = 'filtered' | 'original' | 'split'

/** What the camera remembers between openings (this device only). Nothing
 * here is a position, an image or a clue. */
export interface CameraPrefs {
  highlight: HighlightSettings
  mode: ViewMode
  vibrate: boolean
  sound: boolean
  /** Position of the comparison divider, 10..90 (% of the width). */
  divider: number
}

export const DEFAULT_CAMERA_PREFS: CameraPrefs = {
  highlight: DEFAULT_HIGHLIGHT_SETTINGS,
  mode: 'filtered',
  vibrate: false,
  sound: false,
  divider: 50,
}

export const CAMERA_PREFS_KEY = 'ctr.bloodCamera.prefs.v1'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Rebuilds prefs from whatever was stored: any missing or invalid field falls
 * back to its default, so a damaged entry never breaks the camera. */
export function sanitizePrefs(raw: unknown): CameraPrefs {
  const defaults = DEFAULT_CAMERA_PREFS
  if (!isRecord(raw)) return defaults
  const h = isRecord(raw.highlight) ? raw.highlight : {}
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, min, max)
      : fallback
  return {
    highlight: {
      sensitivity: number(h.sensitivity, defaults.highlight.sensitivity, 0, 100),
      backgroundAttenuation: number(
        h.backgroundAttenuation,
        defaults.highlight.backgroundAttenuation,
        0,
        1,
      ),
      rustTones: typeof h.rustTones === 'boolean' ? h.rustTones : false,
      highlightColor: isHighlightColor(h.highlightColor)
        ? h.highlightColor
        : defaults.highlight.highlightColor,
    },
    mode:
      raw.mode === 'filtered' || raw.mode === 'original' || raw.mode === 'split'
        ? raw.mode
        : defaults.mode,
    vibrate: raw.vibrate === true,
    sound: raw.sound === true,
    divider: number(raw.divider, defaults.divider, 10, 90),
  }
}

export function loadPrefs(): CameraPrefs {
  try {
    const text = window.localStorage.getItem(CAMERA_PREFS_KEY)
    return text ? sanitizePrefs(JSON.parse(text)) : DEFAULT_CAMERA_PREFS
  } catch {
    // Storage blocked or damaged: defaults, no error shown.
    return DEFAULT_CAMERA_PREFS
  }
}

export function savePrefs(prefs: CameraPrefs): void {
  try {
    window.localStorage.setItem(CAMERA_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage unavailable (private mode, quota): the settings simply do not persist.
  }
}
