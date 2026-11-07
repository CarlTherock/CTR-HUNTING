import type { HourSlot } from '../engine'

/** Bornes des données réelles, indépendantes du fuseau et de la durée civile du jour. */
export function chartDomain(slots: readonly HourSlot[]): { start: number; end: number } | null {
  if (!slots.length) return null
  const starts = slots.map((s) => Date.parse(s.startIso))
  const ends = slots.map((s) => Date.parse(s.endIso))
  if (starts.some((v) => !Number.isFinite(v)) || ends.some((v) => !Number.isFinite(v))) return null
  if (starts.some((v, i) => ends[i] <= v)) return null
  const start = Math.min(...starts)
  const end = Math.max(...ends)
  return end > start ? { start, end } : null
}
