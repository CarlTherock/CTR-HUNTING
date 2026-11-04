import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapInstance } from '@/services/map'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { HeadingCone } from './HeadingCone'
import { useHeadingConeStore } from '../state/headingConeStore'
import type { GeolocationReading } from '../useGeolocation'

const compass = vi.hoisted(() => ({
  state: {
    reliable: true,
    trueHeading: 90 as number | null,
    needsPermission: false,
    requestPermission: vi.fn(async () => undefined),
  },
}))
vi.mock('@/features/field-mode/useCompassHeading', () => ({
  useCompassHeading: () => compass.state,
}))

const available = {
  status: 'available',
  value: { lat: 46, lng: -71 },
} as unknown as GeolocationReading
const unavailable = {
  status: 'unavailable',
  reason: 'x',
} as unknown as GeolocationReading

function fakeMap() {
  return { setUserHeading: vi.fn() } as unknown as MapInstance & {
    setUserHeading: ReturnType<typeof vi.fn>
  }
}

describe('HeadingCone', () => {
  beforeEach(() => {
    compass.state = {
      reliable: true,
      trueHeading: 90,
      needsPermission: false,
      requestPermission: vi.fn(async () => undefined),
    }
    useGuidanceStore.setState({ destinationId: null } as never)
  })
  afterEach(() => {
    cleanup()
    useHeadingConeStore.setState({ requester: null })
  })

  it('sets the true heading on the map when the GPS and compass are reliable', () => {
    const map = fakeMap()
    render(<HeadingCone gpsReading={available} getMapInstance={() => map} />)
    expect(map.setUserHeading).toHaveBeenLastCalledWith(90)
  })

  it('shows no cone when the heading is unreliable, missing, or there is no GPS fix', () => {
    const map = fakeMap()
    compass.state = { ...compass.state, reliable: false }
    const { rerender } = render(
      <HeadingCone gpsReading={available} getMapInstance={() => map} />,
    )
    expect(map.setUserHeading).toHaveBeenLastCalledWith(null)
    compass.state = { ...compass.state, reliable: true, trueHeading: null }
    rerender(<HeadingCone gpsReading={available} getMapInstance={() => map} />)
    expect(map.setUserHeading).toHaveBeenLastCalledWith(null)
    compass.state = { ...compass.state, trueHeading: 45 }
    rerender(<HeadingCone gpsReading={unavailable} getMapInstance={() => map} />)
    expect(map.setUserHeading).toHaveBeenLastCalledWith(null)
  })

  it('exposes the permission request only while the compass waits for a tap (iOS)', () => {
    const map = fakeMap()
    compass.state = { ...compass.state, needsPermission: true }
    render(<HeadingCone gpsReading={available} getMapInstance={() => map} />)
    useHeadingConeStore.getState().activate()
    expect(compass.state.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no permission is needed', () => {
    render(<HeadingCone gpsReading={available} getMapInstance={() => fakeMap()} />)
    expect(useHeadingConeStore.getState().requester).toBeNull()
    useHeadingConeStore.getState().activate()
    expect(compass.state.requestPermission).not.toHaveBeenCalled()
  })
})
