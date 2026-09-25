import type { WeatherMapFrame } from '@/types'

/** "14 h 36" / "ven. 18 h" in fr-CA, local device time. */
export function formatFrameClock(frame: WeatherMapFrame, now: Date): string {
  const date = new Date(frame.time)
  const sameDay = date.toDateString() === now.toDateString()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const clock = minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')}`
  if (sameDay) return clock
  const day = date.toLocaleDateString('fr-CA', { weekday: 'short' })
  return `${day} ${clock}`
}

/** "il y a 24 min" / "maintenant" / "dans 5 h". */
export function formatFrameRelative(frame: WeatherMapFrame, now: Date): string {
  const diffMin = Math.round((new Date(frame.time).getTime() - now.getTime()) / 60_000)
  if (frame.kind === 'forecast') {
    if (diffMin < 60 && diffMin > -60) return 'heure actuelle'
    const h = Math.round(diffMin / 60)
    return h > 0 ? `dans ${h} h` : `il y a ${-h} h`
  }
  if (diffMin > -8) return 'maintenant'
  if (diffMin > -60) return `il y a ${-diffMin} min`
  const h = Math.floor(-diffMin / 60)
  const m = -diffMin % 60
  return m === 0 ? `il y a ${h} h` : `il y a ${h} h ${String(m).padStart(2, '0')}`
}
