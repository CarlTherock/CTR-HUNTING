import type { WeatherMapFrame } from '@/types'

export interface TimelineTick {
  index: number
  label: string
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Hour marks that fit the available width: at most `maxTicks`, evenly
 * spread over the frames, always including the first and last. A mark starts
 * with the weekday when the day changes (« ven. 6 h »). Local device time,
 * like the frame readout. */
export function timelineTicks(
  frames: WeatherMapFrame[],
  maxTicks: number,
): TimelineTick[] {
  const n = frames.length
  if (n === 0) return []
  const count = Math.max(2, Math.min(maxTicks, n))
  const indexes = new Set<number>()
  for (let i = 0; i < count; i += 1) indexes.add(Math.round((i * (n - 1)) / (count - 1)))
  let previousDay = ''
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) => {
      const date = new Date(frames[index].time)
      const day = dayKey(date)
      const hour = `${date.getHours()} h`
      const label =
        day !== previousDay && previousDay !== ''
          ? `${date.toLocaleDateString('fr-CA', { weekday: 'short' })} ${hour}`
          : hour
      previousDay = day
      return { index, label }
    })
}

/** « mardi 3 novembre » for the selected frame. */
export function formatFrameDay(frame: WeatherMapFrame): string {
  return new Date(frame.time).toLocaleDateString('fr-CA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}
