import type { HuntWindow, Robustness } from '../engine'

export const COMPASS_8: { label: string; degrees: number }[] = [
  { label: 'N', degrees: 0 },
  { label: 'NE', degrees: 45 },
  { label: 'E', degrees: 90 },
  { label: 'SE', degrees: 135 },
  { label: 'S', degrees: 180 },
  { label: 'SO', degrees: 225 },
  { label: 'O', degrees: 270 },
  { label: 'NO', degrees: 315 },
]

export function windowLabel(w: HuntWindow): string {
  return `${w.startClock}–${w.endClock}`
}

export const ROBUSTNESS_TEXT: Record<Robustness, string> = {
  stable:
    'Classement stable : le meilleur créneau reste le même quand on fait varier les pondérations.',
  fragile: 'Classement fragile : le meilleur créneau change selon les pondérations.',
  equivalent: 'Créneaux équivalents : l’écart est trop petit pour désigner un gagnant.',
  unique: 'Un seul créneau atteint le seuil.',
  none: 'Aucun créneau n’atteint le seuil.',
  insufficient: 'Données insuffisantes pour comparer des créneaux.',
}

export function timeToMinutes(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  return h < 24 && mm < 60 ? h * 60 + mm : null
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** `AAAA-MM-JJ` → « ven. 6 nov. » (sans passer par le fuseau de l'appareil). */
export function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12))
  return new Intl.DateTimeFormat('fr-CA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}
