import type { Track, TrackKind } from '@/types'

/** Red is RESERVED for blood-search tracks. A normal trip can never be given
 * a red (or near-red) colour, so the two types stay distinguishable. */
export const BLOOD_TRACK_COLOR = '#dc2626'

/** Default colour of a normal trip (the historical blue of the live line). */
export const DEFAULT_TRIP_COLOR = '#3b82f6'

export const TRIP_COLOR_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#16a34a', label: 'Vert' },
  { value: '#9333ea', label: 'Violet' },
  { value: '#0891b2', label: 'Turquoise' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#ca8a04', label: 'Jaune foncé' },
  { value: '#db2777', label: 'Rose' },
  { value: '#475569', label: 'Ardoise' },
]

export const TRACK_KIND_LABEL: Record<TrackKind, string> = {
  normal: 'Trajet normal',
  blood: 'Recherche de sang',
}

export type TrackFilter = 'all' | 'normal' | 'blood'

export const TRACK_FILTER_OPTIONS: readonly { value: TrackFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'normal', label: 'Trajets normaux' },
  { value: 'blood', label: 'Recherches de sang' },
]

const HEX = /^#[0-9a-fA-F]{6}$/

/** Tracks recorded before types existed have no `kind`: they are normal trips. */
export function trackKind(track: Pick<Track, 'kind'>): TrackKind {
  return track.kind === 'blood' ? 'blood' : 'normal'
}

/** True for a colour whose hue is red (about 340°–14°) and clearly
 * saturated, i.e. one that could be mistaken for the blood-search red. */
export function isReddish(hex: string): boolean {
  if (!HEX.test(hex)) return false
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return false
  const lightness = (max + min) / 2
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  if (saturation < 0.4 || lightness < 0.2 || lightness > 0.8) return false
  let hue: number
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue = (hue * 60 + 360) % 360
  return hue >= 340 || hue <= 14
}

/** A colour allowed for a NEW normal trip: a valid hex that is not red.
 * Anything else falls back to the default. */
export function sanitizeTripColor(color: string | undefined): string {
  if (!color || !HEX.test(color) || isReddish(color)) return DEFAULT_TRIP_COLOR
  return color.toLowerCase()
}

/** Colour used to DRAW a track. Blood searches are always red; an old track
 * without a colour keeps the historical blue (it is never recoloured). */
export function trackDisplayColor(track: Pick<Track, 'kind' | 'color'>): string {
  if (trackKind(track) === 'blood') return BLOOD_TRACK_COLOR
  return track.color && HEX.test(track.color) ? track.color : DEFAULT_TRIP_COLOR
}

export function matchesTrackFilter(track: Pick<Track, 'kind'>, filter: TrackFilter) {
  return filter === 'all' || trackKind(track) === filter
}
