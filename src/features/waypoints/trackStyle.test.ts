import { describe, expect, it } from 'vitest'
import {
  BLOOD_TRACK_COLOR,
  DEFAULT_TRIP_COLOR,
  TRIP_COLOR_OPTIONS,
  isReddish,
  matchesTrackFilter,
  sanitizeTripColor,
  trackDisplayColor,
  trackKind,
} from './trackStyle'

describe('trackStyle', () => {
  it('keeps red out of the palette of normal trips', () => {
    for (const option of TRIP_COLOR_OPTIONS) expect(isReddish(option.value)).toBe(false)
    expect(isReddish(BLOOD_TRACK_COLOR)).toBe(true)
  })

  it('refuses red or invalid colours for a normal trip', () => {
    expect(sanitizeTripColor('#dc2626')).toBe(DEFAULT_TRIP_COLOR)
    expect(sanitizeTripColor('#FF0000')).toBe(DEFAULT_TRIP_COLOR)
    expect(sanitizeTripColor('red')).toBe(DEFAULT_TRIP_COLOR)
    expect(sanitizeTripColor(undefined)).toBe(DEFAULT_TRIP_COLOR)
    expect(sanitizeTripColor('#16A34A')).toBe('#16a34a')
  })

  it('draws a blood search red whatever colour is stored', () => {
    expect(trackDisplayColor({ kind: 'blood', color: '#16a34a' })).toBe(BLOOD_TRACK_COLOR)
  })

  it('never recolours an old track: no kind = normal, no colour = historical blue', () => {
    expect(trackKind({})).toBe('normal')
    expect(trackDisplayColor({})).toBe(DEFAULT_TRIP_COLOR)
    expect(trackDisplayColor({ kind: 'normal', color: '#9333ea' })).toBe('#9333ea')
  })

  it('filters by kind', () => {
    const blood = { kind: 'blood' as const }
    const old = {}
    expect(matchesTrackFilter(blood, 'all')).toBe(true)
    expect(matchesTrackFilter(blood, 'normal')).toBe(false)
    expect(matchesTrackFilter(blood, 'blood')).toBe(true)
    expect(matchesTrackFilter(old, 'normal')).toBe(true)
    expect(matchesTrackFilter(old, 'blood')).toBe(false)
  })
})
