import { afterEach, describe, expect, it } from 'vitest'
import { useMeasureStore } from './measureStore'

const A = { lat: 46.8, lng: -71.2 }
const B = { lat: 46.8, lng: -71.19 }
const C = { lat: 46.81, lng: -71.19 }

afterEach(() => {
  useMeasureStore.getState().close()
  useMeasureStore.setState({ collapsed: false })
})

describe('measureStore', () => {
  it('starts empty and inactive', () => {
    const state = useMeasureStore.getState()
    expect(state.kind).toBeNull()
    expect(state.active).toBe(false)
    expect(state.points).toEqual([])
  })

  it('ignores taps until a measurement is started', () => {
    useMeasureStore.getState().addPoint(A)
    expect(useMeasureStore.getState().points).toEqual([])
  })

  it('collects points, undoes the last one, and tolerates undo on nothing', () => {
    const store = useMeasureStore.getState()
    store.removeLastPoint()
    store.start('distance')
    store.addPoint(A)
    store.addPoint(B)
    useMeasureStore.getState().removeLastPoint()
    expect(useMeasureStore.getState().points).toEqual([A])
    useMeasureStore.getState().removeLastPoint()
    useMeasureStore.getState().removeLastPoint()
    expect(useMeasureStore.getState().points).toEqual([])
  })

  it('refuses to finish below the minimum (2 points for distance, 3 for area)', () => {
    useMeasureStore.getState().start('distance')
    useMeasureStore.getState().addPoint(A)
    useMeasureStore.getState().finish()
    expect(useMeasureStore.getState().finished).toBe(false)
    useMeasureStore.getState().addPoint(B)
    useMeasureStore.getState().finish()
    expect(useMeasureStore.getState().finished).toBe(true)

    useMeasureStore.getState().start('area')
    useMeasureStore.getState().addPoint(A)
    useMeasureStore.getState().addPoint(B)
    useMeasureStore.getState().finish()
    expect(useMeasureStore.getState().finished).toBe(false)
    useMeasureStore.getState().addPoint(C)
    useMeasureStore.getState().finish()
    expect(useMeasureStore.getState().finished).toBe(true)
  })

  it('locks the measurement once finished: no more taps, no undo', () => {
    useMeasureStore.getState().start('area')
    for (const p of [A, B, C]) useMeasureStore.getState().addPoint(p)
    useMeasureStore.getState().finish()

    const locked = useMeasureStore.getState()
    expect(locked.active).toBe(false)
    locked.addPoint({ lat: 1, lng: 1 })
    useMeasureStore.getState().removeLastPoint()
    expect(useMeasureStore.getState().points).toEqual([A, B, C])
  })

  it('clear empties the points and arms the same tool again', () => {
    useMeasureStore.getState().start('area')
    for (const p of [A, B, C]) useMeasureStore.getState().addPoint(p)
    useMeasureStore.getState().finish()
    useMeasureStore.getState().clear()

    const state = useMeasureStore.getState()
    expect(state.points).toEqual([])
    expect(state.finished).toBe(false)
    expect(state.active).toBe(true)
    expect(state.kind).toBe('area')
  })

  it('pause keeps the drawing; starting the same kind again resumes it', () => {
    useMeasureStore.getState().start('distance')
    useMeasureStore.getState().addPoint(A)
    useMeasureStore.getState().pause()
    expect(useMeasureStore.getState().active).toBe(false)
    useMeasureStore.getState().addPoint(B)
    expect(useMeasureStore.getState().points).toEqual([A])

    useMeasureStore.getState().start('distance')
    expect(useMeasureStore.getState().active).toBe(true)
    expect(useMeasureStore.getState().points).toEqual([A])
  })

  it('switching kind, or restarting after finish, starts from scratch', () => {
    useMeasureStore.getState().start('distance')
    useMeasureStore.getState().addPoint(A)
    useMeasureStore.getState().start('area')
    expect(useMeasureStore.getState().points).toEqual([])
    expect(useMeasureStore.getState().kind).toBe('area')

    for (const p of [A, B, C]) useMeasureStore.getState().addPoint(p)
    useMeasureStore.getState().finish()
    useMeasureStore.getState().start('area')
    expect(useMeasureStore.getState().points).toEqual([])
    expect(useMeasureStore.getState().finished).toBe(false)
  })

  it('close leaves the tool entirely', () => {
    useMeasureStore.getState().start('distance')
    useMeasureStore.getState().addPoint(A)
    useMeasureStore.getState().close()
    const state = useMeasureStore.getState()
    expect(state.kind).toBeNull()
    expect(state.active).toBe(false)
    expect(state.points).toEqual([])
  })
})
