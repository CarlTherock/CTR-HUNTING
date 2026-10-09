import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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
  samples: [
    { coordinate: { lat: 46.8, lng: -71.2 }, hourly: [hour(8, 315), hour(9, 180)] },
  ],
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
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeLessThanOrEqual(
      3,
    )
    expect(screen.getByText(/aucune prévision de déplacement du gibier/)).toBeVisible()
  })

  it('Météo page: five real days, each with its own hours; the shared hour follows the chosen day', async () => {
    // day d, hour h → direction 40°·d + 15°·h, speed 10·d + h km/h
    const day = (d: number) =>
      Array.from({ length: 24 }, (_, h) => ({
        ...hour(h, (40 * d + 15 * h) % 360),
        speedKmh: 10 * d + h,
      }))
    const real = new Date()
    // five consecutive local days starting today (field built from today's date)
    const keys = Array.from({ length: 5 }, (_, d) => {
      const date = new Date(real.getFullYear(), real.getMonth(), real.getDate() + d, 12)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    })
    const hourly = keys.flatMap((key, d) =>
      day(d).map((r) => ({ ...r, time: `${key}${r.time.slice(10)}` })),
    )
    useWindStore.setState({
      field: { timezone: 'America/Toronto', samples: [{ coordinate: here, hourly }] },
      selectedHourOffset: 10,
    })
    // buildForecastDays reads « today » in the field's time zone
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${keys[0]}T15:00:00Z`))
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      render(<WindPanel coordinate={here} />)
      const group = screen.getByRole('group', { name: 'Jour de la prévision de vent' })
      expect(within(group).getAllByRole('button')).toHaveLength(5)

      await user.click(within(group).getAllByRole('button')[4])
      // same hour (10:00) on day 5 = index 106 — its own direction and speed
      expect(useWindStore.getState().selectedHourOffset).toBe(106)
      expect(screen.getByText(/50/, { selector: 'p.text-3xl' })).toBeVisible()
      expect(screen.getByText(/310°/)).toBeVisible()
      // the hour cards now belong to day 5
      const hours = within(screen.getByRole('group', { name: 'Vent heure par heure' }))
      expect(hours.getAllByRole('button')).toHaveLength(24)
      expect(hours.getByRole('button', { pressed: true })).toHaveTextContent('10:00')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a retry when the provider failed and there is no data', () => {
    useWindStore.setState({ field: null, status: 'error', errorReason: 'réseau' })
    render(<WindPanel coordinate={here} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Vent indisponible : réseau')
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeVisible()
  })
})
