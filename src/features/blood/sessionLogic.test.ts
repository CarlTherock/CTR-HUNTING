/* eslint-disable @typescript-eslint/no-non-null-assertion -- test code asserts presence right before use */
import { describe, expect, it } from 'vitest'
import type { Waypoint } from '@/types'
import {
  clueLinkPaths,
  lastBloodClue,
  lastClue,
  markerName,
  overviewView,
  sessionClues,
  trackActiveMs,
} from './sessionLogic'

const wp = (
  id: string,
  createdAt: string,
  bloodKind: Waypoint['bloodKind'],
  sessionId = 's',
): Waypoint => ({
  id,
  name: id,
  coordinate: { lat: Number(id.replace(/\D/g, '')) || 0, lng: 0 },
  category: 'blood',
  bloodKind,
  sessionId,
  createdAt,
  updatedAt: createdAt,
})

describe('markerName', () => {
  it('pads Sang numbers and numbers unique markers from the second one', () => {
    expect(markerName('blood', 1)).toBe('Sang 01')
    expect(markerName('blood', 12)).toBe('Sang 12')
    expect(markerName('shot_site', 1)).toBe('Lieu du tir')
    expect(markerName('shot_site', 2)).toBe('Lieu du tir 02')
    expect(markerName('other_clue', 1)).toBe('Autre indice 01')
  })
})

describe('clues', () => {
  const clues = [
    wp('w3', '2026-10-07T10:03:00Z', 'blood'),
    wp('w1', '2026-10-07T10:01:00Z', 'blood'),
    wp('w2', '2026-10-07T10:02:00Z', 'other_clue'),
    wp('x1', '2026-10-07T10:00:00Z', 'blood', 'other-session'),
  ]

  it('orders a session’s clues chronologically and ignores other sessions', () => {
    expect(sessionClues(clues, 's').map((c) => c.id)).toEqual(['w1', 'w2', 'w3'])
  })

  it('computes the last blood and the last clue without duplication', () => {
    const ordered = sessionClues(clues, 's')
    expect(lastBloodClue(ordered)?.id).toBe('w3')
    expect(lastClue(ordered)?.id).toBe('w3')
    const withLaterClue = [...ordered, wp('w4', '2026-10-07T10:04:00Z', 'other_clue')]
    expect(lastBloodClue(withLaterClue)?.id).toBe('w3')
    expect(lastClue(withLaterClue)?.id).toBe('w4')
    expect(lastBloodClue([])).toBeNull()
  })

  it('links consecutive clues only', () => {
    expect(clueLinkPaths(sessionClues(clues, 's'))).toHaveLength(2)
    expect(clueLinkPaths([wp('w1', 'x', 'blood')])).toEqual([])
  })
})

describe('trackActiveMs', () => {
  const p = (t: string) => ({ lat: 1, lng: 1, timestamp: t })
  it('does not count pauses or gaps', () => {
    const points = [
      p('2026-10-07T10:00:00Z'),
      p('2026-10-07T10:00:30Z'),
      p('2026-10-07T10:30:00Z'), // after a break
      p('2026-10-07T10:30:20Z'),
    ]
    expect(trackActiveMs({ points, breaks: [2] })).toBe(50_000)
    expect(trackActiveMs({ points: [points[0]], breaks: [] })).toBeNull()
  })
})

describe('overviewView', () => {
  it('returns null without clues, a close zoom for one, and a wider one for many', () => {
    expect(overviewView([])).toBeNull()
    expect(overviewView([{ lat: 46.8, lng: -71.2 }])?.zoom).toBe(17)
    const wide = overviewView([
      { lat: 46.8, lng: -71.2 },
      { lat: 46.82, lng: -71.18 },
    ])!
    expect(wide.zoom).toBeLessThan(17)
    expect(wide.center.lat).toBeCloseTo(46.81)
  })
})
