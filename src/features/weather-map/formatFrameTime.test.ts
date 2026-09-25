import { describe, expect, it } from 'vitest'
import { formatFrameRelative } from './formatFrameTime'

const now = new Date('2026-09-25T15:10:00Z')

describe('formatFrameRelative', () => {
  it('labels radar frames by age', () => {
    expect(formatFrameRelative({ time: '2026-09-25T15:06:00Z', kind: 'observed' }, now)).toBe('maintenant')
    expect(formatFrameRelative({ time: '2026-09-25T14:46:00Z', kind: 'observed' }, now)).toBe('il y a 24 min')
    expect(formatFrameRelative({ time: '2026-09-25T13:10:00Z', kind: 'observed' }, now)).toBe('il y a 2 h')
  })

  it('labels forecast frames relative to now', () => {
    expect(formatFrameRelative({ time: '2026-09-25T15:00:00Z', kind: 'forecast' }, now)).toBe('heure actuelle')
    expect(formatFrameRelative({ time: '2026-09-25T20:00:00Z', kind: 'forecast' }, now)).toBe('dans 5 h')
  })
})
