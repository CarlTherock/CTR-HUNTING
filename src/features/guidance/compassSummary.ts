import type { CompassState } from '@/features/field-mode/useCompassHeading'

const MINUS = '−'

/** `−14,9°` / `+3,2°` with a French decimal comma. */
export function formatDeclination(degrees: number): string {
  const sign = degrees < 0 ? MINUS : '+'
  return `${sign}${Math.abs(degrees).toFixed(1).replace('.', ',')}°`
}

export interface CompassSummary {
  text: string
  /** The compass cannot give a usable heading right now. */
  problem: boolean
}

/** One line on the state of the phone compass, with its own caveats. The
 * TRUE heading is named "vrai", the sensor's own reading "magnétique". */
export function compassSummary(
  compass: Pick<
    CompassState,
    | 'reading'
    | 'needsPermission'
    | 'magneticHeading'
    | 'trueHeading'
    | 'declinationDegrees'
    | 'accuracyDegrees'
    | 'reliable'
    | 'warning'
  >,
): CompassSummary {
  if (compass.needsPermission) {
    return {
      text: 'Boussole : autorisation requise pour orienter la flèche.',
      problem: true,
    }
  }
  if (compass.reading.status === 'unavailable' || compass.magneticHeading === null) {
    const reason =
      compass.reading.status === 'unavailable'
        ? (compass.reading.reason ?? 'indisponible')
        : 'indisponible'
    return { text: `Boussole : ${reason}`, problem: true }
  }
  const magnetic = Math.round(compass.magneticHeading) % 360
  const accuracy =
    compass.accuracyDegrees === undefined
      ? 'précision inconnue'
      : `±${Math.round(compass.accuracyDegrees)}°`
  let text: string
  if (compass.trueHeading !== null && compass.declinationDegrees !== null) {
    text = `Cap du téléphone : ${Math.round(compass.trueHeading) % 360}° vrai (${magnetic}° magnétique, déclinaison ${formatDeclination(compass.declinationDegrees)}), ${accuracy}.`
  } else {
    text = `Cap du téléphone : ${magnetic}° magnétique, ${accuracy}. Nord vrai indisponible (déclinaison inconnue).`
  }
  if (compass.warning) text += ` ${compass.warning}`
  return { text, problem: !compass.reliable || compass.trueHeading === null }
}
