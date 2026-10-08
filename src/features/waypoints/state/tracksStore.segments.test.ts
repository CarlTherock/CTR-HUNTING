/* eslint-disable @typescript-eslint/no-non-null-assertion -- test code asserts presence right before use */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useTracksStore } from './tracksStore'

const RESET = {
  tracks: [],
  loaded: false,
  status: 'idle' as const,
  recordingId: null,
  recordingStartedAt: null,
  points: [],
  breaks: [],
  recordingKind: 'normal' as const,
  recordingColor: '#3b82f6',
  recordingSessionId: null,
  distanceMeters: 0,
  persistError: null,
}

// ~111 m per 0.001° of latitude.
const at = (lat: number) => ({ lat, lng: -71.2 })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
})
afterEach(async () => {
  vi.useRealTimers()
  await db.tracks.clear()
  useTracksStore.setState(RESET)
})

describe('track types and colours', () => {
  it('records a normal trip with the chosen colour and keeps it after stop and reload', async () => {
    await useTracksStore.getState().start({ kind: 'normal', color: '#9333ea' })
    useTracksStore.getState().addPoint(at(46.8))
    await useTracksStore.getState().stop()

    useTracksStore.setState(RESET)
    await useTracksStore.getState().load()
    const [track] = useTracksStore.getState().tracks
    expect(track.kind).toBe('normal')
    expect(track.color).toBe('#9333ea')
  })

  it('never gives a normal trip a red colour', async () => {
    await useTracksStore.getState().start({ kind: 'normal', color: '#dc2626' })
    expect(useTracksStore.getState().recordingColor).toBe('#3b82f6')
  })

  it('records a blood search as a blood track tied to its session', async () => {
    const id = await useTracksStore.getState().start({ kind: 'blood', sessionId: 's1' })
    const stored = await db.tracks.get(id!)
    expect(stored?.kind).toBe('blood')
    expect(stored?.sessionId).toBe('s1')
    expect(stored?.color).toBeUndefined()
  })

  it('changes the colour of a normal track without touching its GPS points', async () => {
    await useTracksStore.getState().start({ kind: 'normal' })
    useTracksStore.getState().addPoint(at(46.8))
    useTracksStore.getState().addPoint(at(46.801))
    await useTracksStore.getState().stop()
    const [before] = useTracksStore.getState().tracks
    await useTracksStore.getState().setColor(before.id, '#16a34a')
    const stored = await db.tracks.get(before.id)
    expect(stored?.color).toBe('#16a34a')
    expect(stored?.points).toEqual(before.points)
  })

  it('keeps blood searches red: setColor ignores them', async () => {
    const id = await useTracksStore.getState().start({ kind: 'blood', sessionId: 's1' })
    await useTracksStore.getState().setColor(id!, '#16a34a')
    expect((await db.tracks.get(id!))?.color).toBeUndefined()
  })

  it('does not start a second track while one is recording or paused', async () => {
    const first = await useTracksStore.getState().start({ kind: 'normal' })
    expect(await useTracksStore.getState().start({ kind: 'blood' })).toBeNull()
    useTracksStore.getState().pause()
    expect(await useTracksStore.getState().start({ kind: 'blood' })).toBeNull()
    expect(await db.tracks.count()).toBe(1)
    expect(useTracksStore.getState().recordingId).toBe(first)
  })

  it('does not start two tracks from two simultaneous calls', async () => {
    const [a, b] = await Promise.all([
      useTracksStore.getState().start(),
      useTracksStore.getState().start(),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(await db.tracks.count()).toBe(1)
  })

  it('keeps old tracks without type or colour untouched on load', async () => {
    const legacy = {
      id: 'legacy',
      name: 'Ancienne',
      points: [{ ...at(46.8), timestamp: 'x' }],
      startedAt: '2026-08-01T10:00:00.000Z',
    }
    await db.tracks.add(legacy)
    await useTracksStore.getState().load()
    expect(useTracksStore.getState().tracks).toEqual([legacy])
  })
})

describe('segments (pauses and interruptions)', () => {
  it('starts a new segment after a pause and counts no distance across it', async () => {
    await useTracksStore.getState().start()
    useTracksStore.getState().addPoint(at(46.8))
    vi.setSystemTime(Date.now() + 5_000)
    useTracksStore.getState().addPoint(at(46.801))
    useTracksStore.getState().pause()
    useTracksStore.getState().resume()
    vi.setSystemTime(Date.now() + 5_000)
    useTracksStore.getState().addPoint(at(46.9)) // far away after the pause
    vi.setSystemTime(Date.now() + 5_000)
    useTracksStore.getState().addPoint(at(46.9005))

    const state = useTracksStore.getState()
    expect(state.breaks).toEqual([2])
    // 0.001° + 0.0005° only (~167 m), never the ~11 km jump of the pause.
    expect(state.distanceMeters).toBeGreaterThan(150)
    expect(state.distanceMeters).toBeLessThan(180)
  })

  it('does not break when nothing was missed', async () => {
    await useTracksStore.getState().start()
    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(Date.now() + 5_000)
      useTracksStore.getState().addPoint(at(46.8 + i * 0.001))
    }
    expect(useTracksStore.getState().breaks).toEqual([])
  })

  it('starts a new segment after a long unobserved gap while recording', async () => {
    await useTracksStore.getState().start()
    useTracksStore.getState().addPoint(at(46.8))
    vi.setSystemTime(Date.now() + 10 * 60_000) // app in the background
    useTracksStore.getState().addPoint(at(46.85))
    expect(useTracksStore.getState().breaks).toEqual([1])
    expect(useTracksStore.getState().distanceMeters).toBe(0)
  })

  it('keeps the segments in the database', async () => {
    await useTracksStore.getState().start()
    useTracksStore.getState().addPoint(at(46.8))
    useTracksStore.getState().pause()
    useTracksStore.getState().resume()
    useTracksStore.getState().addPoint(at(46.85))
    await useTracksStore.getState().stop()
    const [track] = await db.tracks.toArray()
    expect(track.breaks).toEqual([1])
  })

  it('resuming an interrupted track never links the gap', async () => {
    await db.tracks.add({
      id: 'cut',
      name: 'Coupée',
      kind: 'blood',
      sessionId: 's1',
      startedAt: '2026-10-07T10:00:00.000Z',
      points: [
        { ...at(46.8), timestamp: '2026-10-07T10:00:00.000Z' },
        { ...at(46.801), timestamp: '2026-10-07T10:00:10.000Z' },
      ],
    })
    await useTracksStore.getState().load()
    useTracksStore.getState().resumeInterrupted('cut')
    expect(useTracksStore.getState().recordingKind).toBe('blood')
    expect(useTracksStore.getState().recordingSessionId).toBe('s1')
    useTracksStore.getState().addPoint(at(46.9))
    expect(useTracksStore.getState().breaks).toEqual([2])
    expect(useTracksStore.getState().points).toHaveLength(3)
  })
})
