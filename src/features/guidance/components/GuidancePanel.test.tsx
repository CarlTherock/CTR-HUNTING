import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { MapInstance } from '@/services/map'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { Waypoint } from '@/types'
import { useGuidanceStore } from '../state/guidanceStore'
import { GUIDANCE_DISCLAIMER, GuidancePanel } from './GuidancePanel'

/**
 * Guidance panel. The GPS fixes and the compass events are SIMULATED
 * (synthetic readings and events): this proves the panel's logic, not the
 * behaviour of a real receiver or a physical compass.
 */
vi.mock('@/services/geomagnetic', () => ({
  // Québec-like declination: magnetic north is 15 degrees west of true north.
  getDeclination: vi.fn().mockResolvedValue(-15),
}))

const HERE = { lat: 46.8, lng: -71.2 }
// ~111 m due north of HERE.
const WAYPOINT: Waypoint = {
  id: 'w1',
  name: 'Mirador nord',
  coordinate: { lat: 46.801, lng: -71.2 },
  category: 'stand_blind',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function fix(
  ageMs = 0,
  extra: Partial<{
    accuracyMeters: number
    courseDegrees: number
    speedMps: number
    lat: number
  }> = {},
): GeolocationReading {
  return {
    status: 'available',
    value: { ...HERE, accuracyMeters: 6, timestampMs: Date.now() - ageMs, ...extra },
    confidence: 'measured',
    source: 'browser-geolocation',
  }
}

const mapMock = { setGuidanceLine: vi.fn(), setUserHeading: vi.fn() }
const getMapInstance = () => mapMock as unknown as MapInstance

function setup(gps: GeolocationReading = fix(), waypoint: Waypoint = WAYPOINT) {
  useWaypointsStore.setState({ waypoints: [waypoint], loaded: true })
  useGuidanceStore.setState({
    destinationId: waypoint.id,
    collapsed: false,
    notice: null,
  })
  return render(<GuidancePanel gpsReading={gps} getMapInstance={getMapInstance} />)
}

function orientation(alpha: number, beta = 0, gamma = 0) {
  const event = new Event('deviceorientationabsolute') as Event & {
    alpha?: number
    beta?: number
    gamma?: number
    absolute?: boolean
  }
  event.alpha = alpha
  event.beta = beta
  event.gamma = gamma
  event.absolute = true
  act(() => {
    window.dispatchEvent(event)
  })
}

async function settleDeclination() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.stubGlobal('DeviceOrientationEvent', () => undefined)
  mapMock.setGuidanceLine.mockClear()
  mapMock.setUserHeading.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useGuidanceStore.setState({ destinationId: null, collapsed: false, notice: null })
  useWaypointsStore.setState({ waypoints: [] })
})

describe('GuidancePanel — content', () => {
  it('shows the destination, distance, true bearing, GPS state, compass state and the exact disclaimer', async () => {
    setup()
    await settleDeclination()

    expect(screen.getByTestId('guidance-title')).toHaveTextContent(
      'Aller à : Mirador nord',
    )
    expect(screen.getByTestId('guidance-distance')).toHaveTextContent('111 m')
    expect(screen.getByTestId('guidance-bearing')).toHaveTextContent('0° N (nord vrai)')
    expect(screen.getByTestId('guidance-gps-state')).toHaveTextContent('GPS : Disponible')
    expect(screen.getByTestId('guidance-gps')).toHaveTextContent('Précision ±6 m')
    expect(screen.getByTestId('guidance-disclaimer')).toHaveTextContent(
      'Guidage à vol d’oiseau — pas un itinéraire routier ou un sentier sécurisé.',
    )
    expect(GUIDANCE_DISCLAIMER).toBe(
      'Guidage à vol d’oiseau — pas un itinéraire routier ou un sentier sécurisé.',
    )
    // No ETA, no turn-by-turn, no route claim.
    const text = screen.getByTestId('guidance-panel').textContent ?? ''
    expect(text).not.toMatch(/arriv|ETA|minutes|tournez|itinéraire calculé/i)
  })

  it('renders the waypoint name as text, never as HTML', () => {
    setup(fix(), { ...WAYPOINT, name: '<img src=x onerror=alert(1)>' })
    expect(screen.getByTestId('guidance-title')).toHaveTextContent(
      'Aller à : <img src=x onerror=alert(1)>',
    )
    expect(document.querySelector('img')).toBeNull()
  })

  it('has Réduire and Arrêter le guidage buttons', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Réduire' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Arrêter le guidage' })).toBeInTheDocument()
  })

  it('collapses to a one-line summary, keeping both buttons, and expands again', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Réduire' }))

    expect(screen.queryByTestId('guidance-body')).toBeNull()
    expect(screen.getByTestId('guidance-summary')).toHaveTextContent('111 m')
    expect(screen.getByTestId('guidance-summary')).toHaveTextContent('à vol d’oiseau')
    expect(screen.getByRole('button', { name: 'Arrêter le guidage' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Agrandir' }))
    expect(screen.getByTestId('guidance-body')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réduire' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('stops guidance with the stop button and removes the panel', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Arrêter le guidage' }))
    expect(useGuidanceStore.getState().destinationId).toBeNull()
    expect(screen.queryByTestId('guidance-panel')).toBeNull()
  })
})

describe('GuidancePanel — GPS states', () => {
  it('denied: shows the reason and no distance or direction', () => {
    setup({
      status: 'unavailable',
      kind: 'denied',
      reason: 'Autorisation de localisation refusée.',
    })
    expect(screen.getByTestId('guidance-unavailable')).toHaveTextContent(
      'Autorisation de localisation refusée.',
    )
    expect(screen.queryByTestId('guidance-distance')).toBeNull()
    expect(screen.queryByTestId('guidance-bearing')).toBeNull()
    expect(screen.queryByTestId('guidance-arrow')).toBeNull()
    expect(screen.getByTestId('guidance-gps-state')).toHaveTextContent('Refusé')
    expect(mapMock.setGuidanceLine).toHaveBeenLastCalledWith(null)
  })

  it('old fix: numbers are shown but flagged non fraîches with the age', () => {
    setup(fix(45_000))
    expect(screen.getByTestId('guidance-distance')).toHaveTextContent('111 m')
    expect(screen.getByTestId('guidance-not-fresh')).toHaveTextContent(/non fraîches/)
    expect(screen.getByTestId('guidance-not-fresh')).toHaveTextContent(/il y a 45 s/)
  })

  it('stale fix: no distance, no direction, no line', () => {
    setup(fix(10 * 60_000))
    expect(screen.getByTestId('guidance-unavailable')).toHaveTextContent(/trop ancien/)
    expect(screen.queryByTestId('guidance-distance')).toBeNull()
    expect(screen.queryByTestId('guidance-bearing')).toBeNull()
    expect(mapMock.setGuidanceLine).toHaveBeenLastCalledWith(null)
  })

  it('within the GPS uncertainty: the exact proximity text, no arrow, no arrival claim', () => {
    setup(fix(0, { accuracyMeters: 150 }))
    expect(screen.getByTestId('guidance-proximity')).toHaveTextContent(
      'À proximité — la précision du GPS (±150 m) ne permet pas d’être plus précis.',
    )
    expect(screen.queryByTestId('guidance-arrow')).toBeNull()
    expect(screen.queryByTestId('guidance-bearing')).toBeNull()
    expect(screen.getByTestId('guidance-panel').textContent).not.toMatch(/arriv/i)
  })

  it('labels the GPS travel direction as such and never turns it into an arrow', () => {
    setup(fix(0, { courseDegrees: 90, speedMps: 2 }))
    expect(screen.getByTestId('guidance-travel')).toHaveTextContent(
      'Direction de déplacement (GPS) : 90° E',
    )
    expect(screen.queryByTestId('guidance-arrow')).toBeNull()
    expect(screen.getByTestId('guidance-arrow-reason')).toHaveTextContent(
      /Cap du téléphone indisponible/,
    )
  })
})

describe('GuidancePanel — compass and arrow', () => {
  it('without a compass reading: bearing in degrees, NO relative arrow', async () => {
    setup()
    await settleDeclination()
    expect(screen.getByTestId('guidance-bearing')).toBeInTheDocument()
    expect(screen.queryByTestId('guidance-arrow')).toBeNull()
    expect(screen.getByTestId('guidance-arrow-reason')).toHaveTextContent(
      /Cap du téléphone indisponible/,
    )
    expect(mapMock.setUserHeading).toHaveBeenLastCalledWith(null)
  })

  it('with a reliable true heading: a relative arrow, and the cone on the map', async () => {
    setup()
    await settleDeclination()
    // Flat phone, alpha 345 => magnetic 15 => true 0 (declination -15): facing the target.
    orientation(345)

    expect(screen.getByTestId('guidance-compass-text')).toHaveTextContent(
      /Cap du téléphone : 0° vrai \(15° magnétique, déclinaison −15,0°\)/,
    )
    expect(screen.getByTestId('guidance-arrow')).toHaveAttribute('data-angle', '0')
    expect(screen.getByTestId('guidance-relative')).toHaveTextContent('Droit devant')
    const heading = mapMock.setUserHeading.mock.calls.at(-1)?.[0] as number
    expect(heading).toBeCloseTo(0, 5)
  })

  it('turns the arrow when the phone turns (target 90 degrees to the left when facing east)', async () => {
    setup()
    await settleDeclination()
    // true 90 => magnetic 105 => alpha 255.
    orientation(255)
    expect(screen.getByTestId('guidance-arrow')).toHaveAttribute('data-angle', '-90')
    expect(screen.getByTestId('guidance-relative')).toHaveTextContent('90° à gauche')
  })

  it('on iOS offers "Activer la boussole" and asks for the permission only on tap', async () => {
    const user = userEvent.setup()
    const requestPermission = vi.fn().mockResolvedValue('granted')
    const Ctor = () => undefined
    Ctor.requestPermission = requestPermission
    vi.stubGlobal('DeviceOrientationEvent', Ctor)
    setup()
    await settleDeclination()

    expect(requestPermission).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'Activer la boussole' })
    expect(screen.getByTestId('guidance-compass-text')).toHaveTextContent(
      /autorisation requise/,
    )

    await user.click(button)
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Activer la boussole' })).toBeNull()
  })

  it('an iOS heading with a poor accuracy shows the calibration warning and no arrow', async () => {
    setup()
    await settleDeclination()
    const event = new Event('deviceorientation') as Event & {
      webkitCompassHeading?: number
      webkitCompassAccuracy?: number
    }
    event.webkitCompassHeading = 15
    event.webkitCompassAccuracy = 40
    act(() => {
      window.dispatchEvent(event)
    })
    expect(screen.getByTestId('guidance-compass-text')).toHaveTextContent(/calibrez/)
    expect(screen.queryByTestId('guidance-arrow')).toBeNull()
    expect(mapMock.setUserHeading).toHaveBeenLastCalledWith(null)
  })
})

describe('GuidancePanel — map line and lifecycle', () => {
  it('draws the line from the fix to the saved coordinates, and clears map items on unmount', () => {
    const { unmount } = setup()
    expect(mapMock.setGuidanceLine).toHaveBeenLastCalledWith([
      { lat: HERE.lat, lng: HERE.lng },
      { lat: 46.801, lng: -71.2 },
    ])
    unmount()
    expect(mapMock.setGuidanceLine).toHaveBeenLastCalledWith(null)
    expect(mapMock.setUserHeading).toHaveBeenLastCalledWith(null)
  })

  it('moves the line when a new fix arrives', () => {
    const { rerender } = setup()
    rerender(
      <GuidancePanel
        gpsReading={fix(0, { lat: 46.8005 })}
        getMapInstance={getMapInstance}
      />,
    )
    expect(mapMock.setGuidanceLine).toHaveBeenLastCalledWith([
      { lat: 46.8005, lng: HERE.lng },
      { lat: 46.801, lng: -71.2 },
    ])
  })

  it('leaves no listener and no timer behind once guidance is stopped', () => {
    vi.useFakeTimers()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    setup()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    expect(add.mock.calls.some((c) => c[0] === 'deviceorientationabsolute')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Arrêter le guidage' }))

    expect(vi.getTimerCount()).toBe(0)
    expect(remove.mock.calls.some((c) => c[0] === 'deviceorientationabsolute')).toBe(true)
    add.mockRestore()
    remove.mockRestore()
  })

  it('shows a dismissible notice when the destination is deleted while guiding', async () => {
    const user = userEvent.setup()
    setup()
    act(() => {
      useWaypointsStore.setState({ waypoints: [] })
    })
    const notice = screen.getByTestId('guidance-notice')
    expect(notice).toHaveTextContent(/Mirador nord/)
    expect(notice).toHaveTextContent(/guidage est arrêté/)
    expect(screen.queryByTestId('guidance-panel')).toBeNull()

    await user.click(within(notice).getByRole('button', { name: 'Fermer le message' }))
    expect(screen.queryByTestId('guidance-notice')).toBeNull()
  })

  it('renders nothing when there is no destination and no notice', () => {
    useGuidanceStore.setState({ destinationId: null, notice: null })
    const { container } = render(
      <GuidancePanel gpsReading={fix()} getMapInstance={getMapInstance} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
