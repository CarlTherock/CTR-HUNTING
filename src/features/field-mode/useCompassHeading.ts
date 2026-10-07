import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeclination } from '@/services/geomagnetic'
import type { Coordinate, DataPoint } from '@/types'
import {
  compassHeading,
  currentScreenAngle,
  headingDifference,
  normalizeHeading,
} from './compassMath'

/**
 * MAGNETIC heading of the direction the user faces, degrees clockwise from
 * magnetic north. (Kept as the hook's `reading` so Field Mode keeps working;
 * the TRUE heading is `trueHeading`.)
 */
export type CompassReading = DataPoint<number>

export interface CompassOptions {
  /** Where the phone is, only used to look up the magnetic declination (local
   * model, no network). Without it `trueHeading` stays `null`. */
  position?: Pick<Coordinate, 'lat' | 'lng'> | null
  /** `false` detaches every listener and timer. Default `true`. */
  enabled?: boolean
}

export interface CompassState {
  /** Magnetic heading (see `CompassReading`), or why there is none. */
  reading: CompassReading
  needsPermission: boolean
  requestPermission: () => Promise<void>
  /** Degrees from magnetic north, or `null` while unavailable. */
  magneticHeading: number | null
  /** Degrees from TRUE north = magnetic + declination; `null` when the
   * heading or the declination is unknown. */
  trueHeading: number | null
  /** Magnetic declination at `position` (east positive), `null` if unknown. */
  declinationDegrees: number | null
  /** Sensor-reported accuracy in degrees, when the platform gives one (iOS). */
  accuracyDegrees: number | undefined
  /** `true` when the heading may be used to orient the user: a fresh sample
   * whose reported accuracy (if any) is within 25 degrees. */
  reliable: boolean
  /** Why a heading that exists is doubtful (e.g. "calibrez"), else `null`. */
  warning: string | null
}

interface DeviceOrientationEventIOS {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/** Safari on iOS reports the MAGNETIC compass heading directly via these
 * non-standard properties. `webkitCompassAccuracy` is the +/- error in
 * degrees; a negative value means the heading is invalid (uncalibrated). */
interface DeviceOrientationEventWebkit extends DeviceOrientationEvent {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

/** No valid sensor event for this long: the heading is lost, not "last known". */
const STALE_AFTER_MS = 3000
/** At most ~10 updates per second. */
const MIN_EMIT_INTERVAL_MS = 100
/** Changes under this are sensor noise and are not re-rendered. */
const MIN_HEADING_CHANGE_DEGREES = 1
/** iOS accuracy above this is reported as "peu fiable, calibrez". */
const MAX_RELIABLE_ACCURACY_DEGREES = 25
const CHECK_INTERVAL_MS = 500
/** Declination changes by far less than a degree over tens of km. */
const DECLINATION_CELL = 0.5

type Status =
  | { kind: 'waiting'; reason: string }
  | { kind: 'unavailable'; reason: string }
  | {
      kind: 'ok'
      magnetic: number
      accuracy: number | undefined
      reliable: boolean
      warning: string | null
    }

const WAITING: Status = {
  kind: 'waiting',
  reason: 'En attente d’une lecture de la boussole.',
}
const UNSUPPORTED: Status = {
  kind: 'unavailable',
  reason: 'L’orientation de l’appareil n’est pas prise en charge par ce navigateur.',
}
const DISABLED: Status = { kind: 'unavailable', reason: 'Boussole désactivée.' }
const PAUSED: Status = {
  kind: 'unavailable',
  reason: 'Boussole en pause (page masquée).',
}
const LOST: Status = {
  kind: 'unavailable',
  reason: 'Cap perdu : plus de lecture récente.',
}
const NO_ABSOLUTE_SENSOR: Status = {
  kind: 'unavailable',
  reason:
    'Aucun cap absolu (par rapport au nord) fourni par cet appareil : cap indisponible.',
}

function supportsOrientation(): boolean {
  return typeof window !== 'undefined' && window.DeviceOrientationEvent != null
}

function needsExplicitPermission(): boolean {
  if (!supportsOrientation()) return false
  const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventIOS
  return typeof ctor.requestPermission === 'function'
}

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden === true
}

/** What one sensor event says. `null` = not a usable absolute heading. */
type Sample =
  | { kind: 'invalid'; reason: string }
  | {
      kind: 'heading'
      magnetic: number
      accuracy: number | undefined
      reliable: boolean
      warning: string | null
    }

/** Reads an event WITHOUT ever treating a relative-only sensor as a north
 * reference: only `webkitCompassHeading` (iOS) or an absolute orientation
 * (`deviceorientationabsolute`, or `absolute === true`) are accepted. */
function readSample(event: Event, screenAngle: number): Sample | null {
  const e = event as DeviceOrientationEventWebkit
  if (typeof e.webkitCompassHeading === 'number') {
    if (!Number.isFinite(e.webkitCompassHeading)) return null
    const accuracy = e.webkitCompassAccuracy
    if (typeof accuracy === 'number' && (!Number.isFinite(accuracy) || accuracy < 0)) {
      return {
        kind: 'invalid',
        reason:
          'Boussole non étalonnée : calibrez-la en dessinant un 8 avec le téléphone.',
      }
    }
    const known = typeof accuracy === 'number'
    const poor = known && accuracy > MAX_RELIABLE_ACCURACY_DEGREES
    return {
      kind: 'heading',
      // iOS gives the heading of the top of the device in portrait: rotate it
      // with the screen so "forward" is the top of the screen being read.
      magnetic: normalizeHeading(e.webkitCompassHeading + screenAngle),
      accuracy: known ? accuracy : undefined,
      reliable: !poor,
      warning: poor ? 'Boussole peu fiable, calibrez-la.' : null,
    }
  }
  const absolute = event.type === 'deviceorientationabsolute' || e.absolute === true
  if (!absolute || e.alpha === null || e.alpha === undefined) return null
  const heading = compassHeading(e.alpha, e.beta, e.gamma, screenAngle)
  if (heading === null) return null
  // The Android absolute sensor does not report an accuracy: unknown, not "good".
  return {
    kind: 'heading',
    magnetic: heading,
    accuracy: undefined,
    reliable: true,
    warning: null,
  }
}

/**
 * Device compass via `DeviceOrientationEvent` — never a fabricated heading.
 *
 * Sources: iOS Safari `webkitCompassHeading` (+ `webkitCompassAccuracy`),
 * which needs a user-gesture `requestPermission()` on iOS 13+; and the
 * standard absolute orientation (`deviceorientationabsolute`, `alpha`/`beta`/
 * `gamma`). Relative-only events are ignored. Both sources are MAGNETIC; the
 * TRUE heading adds the declination from the local WMM model for `position`.
 *
 * Quality rules: the screen rotation is applied; updates are throttled to
 * ~10 Hz and changes under 1 degree are ignored; no valid event for 3 s makes
 * the heading unavailable ("Cap perdu"); listeners and the staleness timer
 * exist only while the hook is enabled, started and the page is visible.
 *
 * The GPS course (travel direction) is NOT a source here and must never be
 * substituted for it.
 */
export function useCompassHeading(options: CompassOptions = {}): CompassState {
  const { position = null, enabled = true } = options
  const [status, setStatus] = useState<Status>(() =>
    supportsOrientation() ? WAITING : UNSUPPORTED,
  )
  const [started, setStarted] = useState(
    () => !needsExplicitPermission() && supportsOrientation(),
  )
  const [visible, setVisible] = useState(() => !pageHidden())
  const [declination, setDeclination] = useState<number | null>(null)

  const requestPermission = useCallback(async () => {
    if (!supportsOrientation()) return
    const ctor = window.DeviceOrientationEvent as unknown as DeviceOrientationEventIOS
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission()
        if (result !== 'granted') {
          setStatus({
            kind: 'unavailable',
            reason: 'Autorisation de la boussole refusée.',
          })
          return
        }
      } catch {
        setStatus({
          kind: 'unavailable',
          reason: 'Impossible de demander l’autorisation de la boussole.',
        })
        return
      }
    }
    setStatus(WAITING)
    setStarted(true)
  }, [])

  // Pause with the page: no sensor listener, no timer while hidden.
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return
    function onVisibility() {
      const isVisible = !pageHidden()
      setVisible(isVisible)
      setStatus((current) =>
        isVisible ? (current === PAUSED ? WAITING : current) : PAUSED,
      )
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled])

  useEffect(() => {
    if (!enabled || !started || !visible || !supportsOrientation()) return

    let screenAngle = currentScreenAngle()
    let lastValidAt = Date.now()
    let lastEmitAt = 0
    let emitted: { magnetic: number; reliable: boolean } | null = null
    let sawRelativeOnly = false
    let lostReported = false
    let lastEvent: Event | null = null

    function process(event: Event, force: boolean) {
      const sample = readSample(event, screenAngle)
      if (sample === null) {
        if (
          event.type === 'deviceorientation' ||
          event.type === 'deviceorientationabsolute'
        ) {
          sawRelativeOnly = true
        }
        return
      }
      const now = Date.now()
      lastValidAt = now
      lostReported = false
      lastEvent = event
      if (sample.kind === 'invalid') {
        emitted = null
        setStatus({ kind: 'unavailable', reason: sample.reason })
        return
      }
      if (!force && emitted) {
        if (now - lastEmitAt < MIN_EMIT_INTERVAL_MS) return
        if (
          headingDifference(sample.magnetic, emitted.magnetic) <
            MIN_HEADING_CHANGE_DEGREES &&
          sample.reliable === emitted.reliable
        ) {
          return
        }
      }
      lastEmitAt = now
      emitted = { magnetic: sample.magnetic, reliable: sample.reliable }
      setStatus({
        kind: 'ok',
        magnetic: sample.magnetic,
        accuracy: sample.accuracy,
        reliable: sample.reliable,
        warning: sample.warning,
      })
    }

    function handle(event: Event) {
      process(event, false)
    }

    // A screen rotation changes the heading without the sensor moving.
    function onScreenRotation() {
      screenAngle = currentScreenAngle()
      if (lastEvent) process(lastEvent, true)
    }

    const timer = setInterval(() => {
      if (Date.now() - lastValidAt <= STALE_AFTER_MS) return
      if (emitted) {
        emitted = null
        lostReported = true
        setStatus(LOST)
      } else if (!lostReported && sawRelativeOnly) {
        setStatus(NO_ABSOLUTE_SENSOR)
      }
    }, CHECK_INTERVAL_MS)

    window.addEventListener('deviceorientationabsolute', handle)
    window.addEventListener('deviceorientation', handle)
    window.addEventListener('orientationchange', onScreenRotation)
    const screenOrientation = window.screen?.orientation
    screenOrientation?.addEventListener?.('change', onScreenRotation)
    return () => {
      clearInterval(timer)
      window.removeEventListener('deviceorientationabsolute', handle)
      window.removeEventListener('deviceorientation', handle)
      window.removeEventListener('orientationchange', onScreenRotation)
      screenOrientation?.removeEventListener?.('change', onScreenRotation)
    }
  }, [enabled, started, visible])

  const cellLat = position ? Math.floor(position.lat / DECLINATION_CELL) : null
  const cellLng = position ? Math.floor(position.lng / DECLINATION_CELL) : null
  useEffect(() => {
    if (!enabled || cellLat === null || cellLng === null) return
    let cancelled = false
    const point = {
      lat: (cellLat + 0.5) * DECLINATION_CELL,
      lng: (cellLng + 0.5) * DECLINATION_CELL,
    }
    void getDeclination(point, new Date()).then((value) => {
      if (!cancelled) setDeclination(value)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, cellLat, cellLng])

  const effective: Status = enabled ? status : DISABLED
  const magneticHeading = effective.kind === 'ok' ? effective.magnetic : null
  const declinationDegrees = position ? declination : null
  const trueHeading =
    magneticHeading !== null && declinationDegrees !== null
      ? normalizeHeading(magneticHeading + declinationDegrees)
      : null

  const reading = useMemo<CompassReading>(
    () =>
      effective.kind === 'ok'
        ? {
            status: 'available',
            value: effective.magnetic,
            confidence: 'measured',
            source: 'device-orientation',
          }
        : { status: 'unavailable', reason: effective.reason },
    [effective],
  )

  return {
    reading,
    needsPermission: needsExplicitPermission() && !started,
    requestPermission,
    magneticHeading,
    trueHeading,
    declinationDegrees,
    accuracyDegrees: effective.kind === 'ok' ? effective.accuracy : undefined,
    reliable: effective.kind === 'ok' && effective.reliable,
    warning: effective.kind === 'ok' ? effective.warning : null,
  }
}
