import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useBloodStore } from './bloodStore'

const HERE = { lat: 46.8, lng: -71.2, accuracyMeters: 5 }
const TRACKS_RESET = {
  tracks: [],
  loaded: false,
  status: 'idle' as const,
  recordingId: null,
  recordingStartedAt: null,
  points: [],
  breaks: [],
  recordingKind: 'normal' as const,
  recordingSessionId: null,
  distanceMeters: 0,
  persistError: null,
}
const BLOOD_RESET = {
  sessions: [],
  loaded: false,
  lastAddedId: null,
  showLinks: false,
  manual: null,
}

const blood = () => useBloodStore.getState()

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  useTracksStore.setState(TRACKS_RESET)
  useWaypointsStore.setState({ waypoints: [], loaded: true })
  useBloodStore.setState(BLOOD_RESET)
})
afterEach(() => vi.restoreAllMocks())

describe('starting a session', () => {
  it('with a usable fix: records a red (blood) track tied to the session', async () => {
    const result = await blood().startSession({ hasUsableFix: true })
    expect(result.ok).toBe(true)
    const [session] = blood().sessions
    expect(session.status).toBe('active')
    expect(session.trackId).toBeTruthy()
    expect(useTracksStore.getState().status).toBe('recording')
    const track = await db.tracks.get(session.trackId!)
    expect(track).toMatchObject({ kind: 'blood', sessionId: session.id })
    expect(session.startedAt).toBeTruthy()
  })

  it('without GPS: waits, records nothing, then starts at the first usable fix', async () => {
    await blood().startSession({ hasUsableFix: false })
    const [waiting] = blood().sessions
    expect(waiting.status).toBe('waiting_gps')
    expect(useTracksStore.getState().status).toBe('idle')
    expect(await db.tracks.count()).toBe(0)

    await blood().onUsableFix()
    expect(blood().sessions[0].status).toBe('active')
    expect(useTracksStore.getState().status).toBe('recording')
    // No point was invented while waiting.
    expect(useTracksStore.getState().points).toEqual([])
  })

  it('can be cancelled while waiting, leaving nothing behind', async () => {
    await blood().startSession({ hasUsableFix: false })
    await blood().cancelWaiting(blood().sessions[0].id)
    expect(blood().sessions).toEqual([])
    expect(await db.bloodSessions.count()).toBe(0)
    expect(await db.tracks.count()).toBe(0)
  })

  it('refuses to start silently when another trace is recording', async () => {
    await useTracksStore.getState().start({ kind: 'normal' })
    const result = await blood().startSession({ hasUsableFix: true })
    expect(result).toMatchObject({ ok: false, reason: 'track-active' })
    expect(await db.bloodSessions.count()).toBe(0)
    expect(await db.tracks.count()).toBe(1)
  })

  it('refuses a second open session', async () => {
    await blood().startSession({ hasUsableFix: false })
    const result = await blood().startSession({ hasUsableFix: true })
    expect(result).toMatchObject({ ok: false, reason: 'session-open' })
  })
})

describe('pause, resume, finish', () => {
  it('pauses and resumes the same track, then finishes without deleting anything', async () => {
    await blood().startSession({ hasUsableFix: true })
    const trackId = blood().sessions[0].trackId!
    await blood().pause()
    expect(blood().sessions[0].status).toBe('paused')
    expect(useTracksStore.getState().status).toBe('paused')
    await blood().resume()
    expect(blood().sessions[0].status).toBe('active')
    expect(useTracksStore.getState().recordingId).toBe(trackId)

    await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    await blood().finish()
    expect(blood().sessions[0].status).toBe('finished')
    expect(blood().sessions[0].endedAt).toBeTruthy()
    expect(useTracksStore.getState().status).toBe('idle')
    expect((await db.tracks.get(trackId))?.endedAt).toBeTruthy()
    expect(await db.waypoints.count()).toBe(1)
    // A finished session no longer blocks starting another.
    expect(blood().openSession()).toBeNull()
  })
})

describe('clues', () => {
  it('each press creates one real waypoint, in the shared waypoint list', async () => {
    await blood().startSession({ hasUsableFix: true })
    const a = await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    const b = await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    expect(a.ok && b.ok).toBe(true)
    expect(useWaypointsStore.getState().waypoints.map((w) => w.name)).toEqual([
      'Sang 01',
      'Sang 02',
    ])
    expect(await db.waypoints.count()).toBe(2)
  })

  it('reports a failed write and creates nothing', async () => {
    await blood().startSession({ hasUsableFix: true })
    const proto = Object.getPrototypeOf(db.waypoints) as {
      add: (...args: unknown[]) => Promise<unknown>
    }
    const original = proto.add
    proto.add = () => Promise.reject(new Error('stockage plein'))
    let result
    try {
      result = await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    } finally {
      proto.add = original
    }
    expect(result).toMatchObject({ ok: false })
    expect(result && !result.ok && result.message).toMatch(/non enregistré/)
    expect(useWaypointsStore.getState().waypoints).toEqual([])
    expect(blood().lastAddedId).toBeNull()
  })

  it('needs an open session', async () => {
    const result = await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    expect(result.ok).toBe(false)
  })

  it('undo deletes only the last clue and never reuses its number', async () => {
    await blood().startSession({ hasUsableFix: true })
    await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    expect((await blood().undoInfo())?.hasExtras).toBe(false)
    await blood().undoLast()
    expect(useWaypointsStore.getState().waypoints.map((w) => w.name)).toEqual(['Sang 01'])
    const next = await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    expect(next.ok && next.waypoint.name).toBe('Sang 03')
  })

  it('warns before undoing a clue that received a note or a photo', async () => {
    await blood().startSession({ hasUsableFix: true })
    const added = await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    if (!added.ok) throw new Error('setup')
    await useWaypointsStore
      .getState()
      .updateWaypoint(added.waypoint.id, { notes: 'goutte' })
    expect((await blood().undoInfo())?.hasExtras).toBe(true)
    await db.waypoints.update(added.waypoint.id, { notes: '' })
    useWaypointsStore.setState({
      waypoints: useWaypointsStore
        .getState()
        .waypoints.map((w) => (w.id === added.waypoint.id ? { ...w, notes: '' } : w)),
    })
    await db.photos.add({
      id: 'p',
      waypointId: added.waypoint.id,
      blob: new Blob(['x']),
      originalBlob: new Blob(['x']),
      createdAt: 'x',
    })
    expect((await blood().undoInfo())?.hasExtras).toBe(true)
  })

  it('manual placement: nothing is saved until confirmed, then the origin is manual', async () => {
    await blood().startSession({ hasUsableFix: true })
    blood().startManual('blood')
    expect(await blood().confirmManual()).toMatchObject({ ok: false })
    expect(await db.waypoints.count()).toBe(0)
    blood().setManualCoordinate({ lat: 46.81, lng: -71.21 })
    blood().setManualCoordinate({ lat: 46.82, lng: -71.22 }) // adjusted before saving
    const result = await blood().confirmManual()
    expect(result.ok).toBe(true)
    const [stored] = await db.waypoints.toArray()
    expect(stored).toMatchObject({
      origin: 'manual',
      coordinate: { lat: 46.82, lng: -71.22 },
    })
    expect(blood().manual).toBeNull()
  })
})

describe('recovery after a closed app', () => {
  it('reloads an interrupted session, keeps its clues, and resumes without linking the gap', async () => {
    await blood().startSession({ hasUsableFix: true })
    const trackId = blood().sessions[0].trackId!
    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
    await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    await useTracksStore.getState().flush()

    // « App closed »: in-memory state is gone, the database remains.
    useTracksStore.setState(TRACKS_RESET)
    useBloodStore.setState(BLOOD_RESET)
    useWaypointsStore.setState({ waypoints: [], loaded: false })
    await Promise.all([
      blood().load(),
      useTracksStore.getState().load(),
      useWaypointsStore.getState().load(),
    ])

    const session = blood().openSession()!
    expect(session.status).toBe('active')
    expect(useTracksStore.getState().status).toBe('idle') // not auto-started
    expect(useWaypointsStore.getState().waypoints.map((w) => w.name)).toEqual(['Sang 01'])
    expect(await db.tracks.count()).toBe(1)

    await blood().resumeInterrupted(session.id)
    expect(useTracksStore.getState().recordingId).toBe(trackId)
    useTracksStore.getState().addPoint({ lat: 46.9, lng: -71.2 })
    expect(useTracksStore.getState().breaks).toEqual([1])
    const next = await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    expect(next.ok && next.waypoint.name).toBe('Sang 02')
  })

  it('can finish an interrupted session instead, ending the track at its last real point', async () => {
    await blood().startSession({ hasUsableFix: true })
    useTracksStore.getState().addPoint({ lat: 46.8, lng: -71.2 })
    await useTracksStore.getState().flush()
    useTracksStore.setState(TRACKS_RESET)
    useBloodStore.setState(BLOOD_RESET)
    await Promise.all([blood().load(), useTracksStore.getState().load()])
    await blood().finish(blood().sessions[0].id)
    expect(blood().sessions[0].status).toBe('finished')
    const [track] = await db.tracks.toArray()
    expect(track.endedAt).toBe(track.points.at(-1)?.timestamp)
  })
})

describe('deleting a session', () => {
  it('can keep its clues and track as ordinary items', async () => {
    await blood().startSession({ hasUsableFix: true })
    await blood().addMarker('blood', { coordinate: HERE, origin: 'gps' })
    const id = blood().sessions[0].id
    await blood().finish()
    await blood().deleteSession(id, false)
    expect(blood().sessions).toEqual([])
    expect(await db.waypoints.count()).toBe(1)
    expect(await db.tracks.count()).toBe(1)
    expect(useWaypointsStore.getState().waypoints[0].sessionId).toBeUndefined()
  })
})
