import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WindField } from '@/types'
import { useWindStore } from '../state/windStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { WindPanel } from './WindPanel'

const hour = (h: number, dir: number) => ({
  time: `2026-10-08T${String(h).padStart(2, '0')}:00`,
  directionDegrees: dir,
  speedKmh: 12,
  gustsKmh: 25,
  temperatureCelsius: 5,
  precipitationMm: 0,
  cloudCoverPercent: 0,
})
const field: WindField = {
  timezone: 'America/Toronto',
  samples: [{ coordinate: { lat: 46.8, lng: -71.2 }, hourly: [hour(8, 315), hour(9, 180)] }],
}
const here = { lat: 46.8, lng: -71.2 }

beforeEach(() => {
  useWindStore.setState({
    field,
    status: 'available',
    selectedHourOffset: 0,
    fetchedAt: '2026-10-08T12:00:00.000Z',
    fetch: vi.fn(),
  })
  useWaypointsStore.setState({
    waypoints: [
      {
        id: 'w1',
        name: 'Affût nord-ouest',
        coordinate: { lat: 46.8, lng: -71.2 },
        category: 'stand',
        optimalWindDirections: [315],
      } as never,
    ],
  })
})

describe('WindPanel', () => {
  it('shows origin direction, speed and gusts, and « non renseigné » without a spot', () => {
    render(<WindPanel coordinate={here} />)
    expect(screen.getByText(/NO \(315°\)/)).toBeVisible()
    expect(screen.getByText(/Rafales 25 km\/h/)).toBeVisible()
    expect(screen.getByText('Secteurs favorables non renseignés')).toBeVisible()
  })

  it('judges favorable / défavorable only against the spot’s saved sectors', async () => {
    const user = userEvent.setup()
    render(<WindPanel coordinate={here} />)
    await user.selectOptions(screen.getByLabelText(/Spot de référence/), 'w1')
    expect(screen.getByText('Vent favorable pour ce spot')).toBeVisible()

    await user.click(screen.getByRole('button', { name: /09:00/ }))
    expect(useWindStore.getState().selectedHourOffset).toBe(1)
    expect(screen.getByText('Vent défavorable pour ce spot')).toBeVisible()
  })

  it('only offers the hours that really exist', () => {
    render(<WindPanel coordinate={here} />)
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeLessThanOrEqual(3)
    expect(screen.getByText(/aucune prévision de déplacement du gibier/)).toBeVisible()
  })

  it('shows a retry when the provider failed and there is no data', () => {
    useWindStore.setState({ field: null, status: 'error', errorReason: 'réseau' })
    render(<WindPanel coordinate={here} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Vent indisponible : réseau')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })
})
