import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useWindStore } from '@/features/wind/state/windStore'
import { useWaypointsStore } from '../state/waypointsStore'
import { WindComparisonPanel } from './WindComparisonPanel'
import type { Waypoint, WindField } from '@/types'

function makeWaypoint(overrides: Partial<Waypoint>): Waypoint {
  return {
    id: 'wp-1',
    name: 'Ridge stand',
    coordinate: { lat: 46.8, lng: -71.2 },
    category: 'stand_blind',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

const FIELD: WindField = {
  timezone: 'America/Toronto',
  samples: [
    {
      coordinate: { lat: 46.8, lng: -71.2 },
      hourly: [
        {
          time: '2026-08-17T10:00',
          directionDegrees: 270, // W
          speedKmh: 12,
          gustsKmh: 20,
          temperatureCelsius: 18,
          precipitationMm: 0,
          cloudCoverPercent: 30,
        },
      ],
    },
  ],
}

afterEach(() => {
  useWaypointsStore.setState({ waypoints: [], loaded: false, isPlacing: false, editingId: null })
  useWindStore.setState({
    status: 'idle',
    field: null,
    errorReason: null,
    enabled: false,
    selectedHourOffset: 0,
    activeLayer: 'wind',
  })
})

describe('WindComparisonPanel', () => {
  it('renders nothing when no waypoint has an optimal wind preference set', () => {
    useWaypointsStore.setState({ waypoints: [makeWaypoint({ optimalWindDirections: undefined })] })

    const { container } = render(<WindComparisonPanel />)

    expect(container).toBeEmptyDOMElement()
  })

  it('prompts to enable the wind layer when candidates exist but no field is loaded', () => {
    useWaypointsStore.setState({ waypoints: [makeWaypoint({ optimalWindDirections: [0, 45] })] })

    render(<WindComparisonPanel />)

    expect(screen.getByText(/Turn on the wind layer/)).toBeInTheDocument()
  })

  it('flags a mismatch when the live wind does not match the saved optimal directions', () => {
    useWaypointsStore.setState({
      waypoints: [makeWaypoint({ optimalWindDirections: [0, 45] })], // N/NE preferred
    })
    useWindStore.setState({ field: FIELD }) // live wind is W (270°)

    render(<WindComparisonPanel />)

    expect(screen.getByText('Ridge stand')).toBeInTheDocument()
    expect(screen.getByText(/not optimal/)).toBeInTheDocument()
  })

  it('flags a match when the live wind does match the saved optimal directions', () => {
    useWaypointsStore.setState({
      waypoints: [makeWaypoint({ optimalWindDirections: [270] })], // W preferred
    })
    useWindStore.setState({ field: FIELD })

    render(<WindComparisonPanel />)

    expect(screen.getByText(/matches optimal/)).toBeInTheDocument()
  })
})
