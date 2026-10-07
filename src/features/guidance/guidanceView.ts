import type { Coordinate } from '@/types'
import { formatAge, gpsAgeMs, gpsFreshness } from '@/features/gps/gpsFreshness'
import { gpsStatusView } from '@/features/gps/gpsStatus'
import type { GpsStatusView } from '@/features/gps/gpsStatus'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { haversineMeters } from '@/utils/geo'
import { formatDistanceMeters } from '@/utils/format'
import { compassLabel } from '@/utils/terrain'
import { initialBearingDegrees, relativeAngle } from './angles'

/**
 * View-model of "Aller à": everything the panel and the map line show,
 * computed from the destination, the GPS reading, the clock and the phone
 * heading. Pure and synchronous; nothing is written anywhere.
 *
 * Rules:
 *  - No distance and no direction unless there is a GPS fix that is not stale:
 *    nothing is ever computed from a supposed position.
 *  - A fix that is `old` still gives numbers, but flagged "non fraîches".
 *  - Within the GPS uncertainty (max(accuracy, 10 m)) there is no arrow and no
 *    "arrived" message: the app cannot know.
 *  - The arrow relative to the phone requires a RELIABLE TRUE-north heading.
 *    The GPS travel course is never used as the phone's heading.
 */

/** Distance below which the fix cannot tell "there" from "next to there". */
export const MIN_UNCERTAINTY_METERS = 10
/** Travel direction from the GPS is only meaningful when actually moving. */
export const MIN_TRAVEL_SPEED_MPS = 1

export interface GuidanceDestination {
  name: string
  coordinate: Coordinate
}

/** What the guidance needs to know about the phone heading (a subset of the
 * compass hook's state, so the hook's return value fits). */
export interface GuidanceHeading {
  magneticHeading: number | null
  /** Relative to TRUE north; `null` when unknown or the declination is unknown. */
  trueHeading: number | null
  reliable: boolean
  declinationDegrees: number | null
  warning: string | null
  /** Why the compass has no heading, when it has none. */
  unavailableReason?: string | null
}

export interface GuidanceInput {
  destination: GuidanceDestination | null
  gps: GeolocationReading
  nowMs: number
  heading?: GuidanceHeading | null
}

export type GuidanceMode =
  /** No usable destination. */
  | 'no-destination'
  /** No GPS fix (searching, denied, unsupported...). */
  | 'no-position'
  /** A fix exists but is too old to compute anything from. */
  | 'stale'
  /** Distance is within the GPS uncertainty. */
  | 'within-uncertainty'
  | 'tracking'

export type GuidanceFreshness = 'recent' | 'old' | 'stale' | 'none'

export type GuidanceArrow =
  | {
      kind: 'relative'
      /** Degrees clockwise from the top of the phone, in (-180, 180]. */
      angleDegrees: number
      /** Text equivalent of the arrow, e.g. "32° à droite". */
      description: string
    }
  | {
      kind: 'none'
      /** Why there is no arrow, when the bearing itself is shown. */
      reason: string | null
    }

export interface GuidanceView {
  mode: GuidanceMode
  destinationName: string | null
  freshness: GuidanceFreshness
  /** The numbers come from an `old` fix and must be re-checked. */
  notFresh: boolean
  notFreshNotice: string | null
  distanceMeters: number | null
  distanceText: string | null
  /** Bearing to the destination from TRUE north, [0, 360). */
  bearingTrueDegrees: number | null
  bearingCardinal: string | null
  /** e.g. "42° NE (nord vrai)". */
  bearingText: string | null
  arrow: GuidanceArrow
  /** Why there is no distance (no fix, stale fix, no destination). */
  unavailableReason: string | null
  /** Shown instead of a direction when within the GPS uncertainty. */
  proximityMessage: string | null
  /** GPS state, accuracy and age, as shown by "Ma position". */
  gps: GpsStatusView
  /** "Direction de déplacement (GPS) : 120° ESE", only while moving. */
  travelDirectionText: string | null
  /** Endpoints of the dashed line on the map; `null` without a usable fix. */
  line: { from: Coordinate; to: Coordinate } | null
}

function describeRelative(angle: number): string {
  const abs = Math.abs(angle)
  if (abs <= 5) return 'Droit devant'
  if (abs >= 175) return 'Derrière vous'
  return `${Math.round(abs)}° à ${angle > 0 ? 'droite' : 'gauche'}`
}

function validCoordinate(c: Coordinate | undefined): c is Coordinate {
  return (
    c !== undefined &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    Math.abs(c.lat) <= 90 &&
    Math.abs(c.lng) <= 180
  )
}

function arrowFor(
  bearing: number,
  heading: GuidanceHeading | null | undefined,
): GuidanceArrow {
  const head = 'Cap du téléphone indisponible'
  if (!heading) return { kind: 'none', reason: `${head}.` }
  if (heading.magneticHeading === null) {
    return {
      kind: 'none',
      reason: heading.unavailableReason
        ? `${head} — ${heading.unavailableReason}`
        : `${head}.`,
    }
  }
  if (!heading.reliable) {
    return {
      kind: 'none',
      reason: `${head} — ${heading.warning ?? 'cap peu fiable.'}`,
    }
  }
  if (heading.trueHeading === null) {
    return {
      kind: 'none',
      reason: `${head} — déclinaison magnétique inconnue : le cap ne peut pas être ramené au nord vrai.`,
    }
  }
  const angle = relativeAngle(bearing, heading.trueHeading)
  return { kind: 'relative', angleDegrees: angle, description: describeRelative(angle) }
}

export function guidanceView(input: GuidanceInput): GuidanceView {
  const { destination, gps, nowMs, heading } = input
  const gpsView = gpsStatusView(gps, nowMs)
  const empty: GuidanceView = {
    mode: 'no-destination',
    destinationName: destination?.name ?? null,
    freshness: 'none',
    notFresh: false,
    notFreshNotice: null,
    distanceMeters: null,
    distanceText: null,
    bearingTrueDegrees: null,
    bearingCardinal: null,
    bearingText: null,
    arrow: { kind: 'none', reason: null },
    unavailableReason: null,
    proximityMessage: null,
    gps: gpsView,
    travelDirectionText: null,
    line: null,
  }

  if (!destination || !validCoordinate(destination.coordinate)) {
    return { ...empty, unavailableReason: 'Le point de destination est introuvable.' }
  }

  if (gps.status === 'unavailable') {
    return { ...empty, mode: 'no-position', unavailableReason: gps.reason }
  }

  const fix = gps.value
  const freshness = gpsFreshness(nowMs, fix.timestampMs)
  if (!validCoordinate(fix) || freshness === 'stale') {
    const reason = !validCoordinate(fix)
      ? 'La position GPS reçue est invalide : aucune distance ni direction n’est calculée.'
      : `Le dernier relevé GPS (${formatAge(gpsAgeMs(nowMs, fix.timestampMs))}) est trop ancien : aucune distance ni direction n’est calculée.`
    return {
      ...empty,
      mode: 'stale',
      freshness: 'stale',
      unavailableReason: reason,
    }
  }

  const distance = haversineMeters(fix, destination.coordinate)
  const notFresh = freshness === 'old'
  const notFreshNotice = notFresh
    ? `Données non fraîches (${gpsView.ageText ?? 'relevé ancien'}) : distance et direction à vérifier.`
    : null
  const accuracy =
    typeof fix.accuracyMeters === 'number' && Number.isFinite(fix.accuracyMeters)
      ? fix.accuracyMeters
      : null
  const base: GuidanceView = {
    ...empty,
    freshness,
    notFresh,
    notFreshNotice,
    distanceMeters: distance,
    distanceText: formatDistanceMeters(distance),
    line: {
      from: { lat: fix.lat, lng: fix.lng },
      to: { lat: destination.coordinate.lat, lng: destination.coordinate.lng },
    },
  }

  if (distance <= Math.max(accuracy ?? 0, MIN_UNCERTAINTY_METERS)) {
    return {
      ...base,
      mode: 'within-uncertainty',
      proximityMessage: `À proximité — la précision du GPS (${
        accuracy === null ? 'inconnue' : `±${Math.round(accuracy)} m`
      }) ne permet pas d’être plus précis.`,
    }
  }

  const bearing = initialBearingDegrees(fix, destination.coordinate)
  if (bearing === null) {
    return { ...base, mode: 'within-uncertainty', proximityMessage: null }
  }
  const cardinal = compassLabel(bearing)
  const travelling =
    freshness === 'recent' &&
    typeof fix.courseDegrees === 'number' &&
    typeof fix.speedMps === 'number' &&
    fix.speedMps >= MIN_TRAVEL_SPEED_MPS

  return {
    ...base,
    mode: 'tracking',
    bearingTrueDegrees: bearing,
    bearingCardinal: cardinal,
    bearingText: `${Math.round(bearing) % 360}° ${cardinal} (nord vrai)`,
    arrow: arrowFor(bearing, heading),
    travelDirectionText: travelling
      ? `Direction de déplacement (GPS) : ${Math.round(fix.courseDegrees as number) % 360}° ${compassLabel(fix.courseDegrees as number)}`
      : null,
  }
}
