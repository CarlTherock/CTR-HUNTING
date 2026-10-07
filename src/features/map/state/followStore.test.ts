import { afterEach, describe, expect, it } from 'vitest'
import { canRecenterOn } from '../useFollowPosition'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useFollowStore } from './followStore'

afterEach(() => useFollowStore.setState({ mode: 'off' }))

describe('followStore', () => {
  it('toggles off -> following -> off', () => {
    useFollowStore.getState().toggle()
    expect(useFollowStore.getState().mode).toBe('following')
    useFollowStore.getState().toggle()
    expect(useFollowStore.getState().mode).toBe('off')
  })

  it('a user gesture pauses only a running follow', () => {
    useFollowStore.getState().pauseForUserGesture()
    expect(useFollowStore.getState().mode).toBe('off')

    useFollowStore.getState().toggle()
    useFollowStore.getState().pauseForUserGesture()
    expect(useFollowStore.getState().mode).toBe('paused')
  })

  it('resume only works from paused; toggling from paused follows again', () => {
    useFollowStore.getState().resume()
    expect(useFollowStore.getState().mode).toBe('off')

    useFollowStore.setState({ mode: 'paused' })
    useFollowStore.getState().resume()
    expect(useFollowStore.getState().mode).toBe('following')

    useFollowStore.setState({ mode: 'paused' })
    useFollowStore.getState().toggle()
    expect(useFollowStore.getState().mode).toBe('following')
  })

  it('stop switches it off from any state', () => {
    useFollowStore.setState({ mode: 'paused' })
    useFollowStore.getState().stop()
    expect(useFollowStore.getState().mode).toBe('off')
  })
})

describe('canRecenterOn', () => {
  const NOW = 1_000_000
  const fix = (ageMs: number): GeolocationReading => ({
    status: 'available',
    value: { lat: 46.8, lng: -71.2, timestampMs: NOW - ageMs },
    confidence: 'measured',
    source: 'browser-geolocation',
  })

  it('accepts only a recent fix', () => {
    expect(canRecenterOn(fix(0), NOW)).toBe(true)
    expect(canRecenterOn(fix(15_000), NOW)).toBe(true)
    expect(canRecenterOn(fix(16_000), NOW)).toBe(false) // old
    expect(canRecenterOn(fix(10 * 60_000), NOW)).toBe(false) // stale
    expect(
      canRecenterOn({ status: 'unavailable', kind: 'denied', reason: 'x' }, NOW),
    ).toBe(false)
  })
})
