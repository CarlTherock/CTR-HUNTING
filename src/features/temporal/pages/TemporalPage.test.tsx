import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemporalPage } from './TemporalPage'
import { useWindStore } from '@/features/wind/state/windStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'

let mockGpsReading: GeolocationReading = {
  status: 'unavailable',
  reason: 'Geolocation is not supported by this browser.',
}
vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => mockGpsReading,
}))

afterEach(() => {
  mockGpsReading = {
    status: 'unavailable',
    reason: 'Geolocation is not supported by this browser.',
  }
  useWindStore.setState({ selectedHourOffset: 0 })
})

describe('TemporalPage', () => {
  it('renders real sun, moon, and solunar data for the map-center fallback location', async () => {
    render(<TemporalPage />)

    expect(
      screen.getByText('Position de la carte utilisée — GPS indisponible'),
    ).toBeInTheDocument()
    expect(screen.getByText('Soleil')).toBeInTheDocument()
    expect(screen.getByText('Lune')).toBeInTheDocument()
    // A real phase name (one of the 8) must be shown, not a placeholder.
    expect(
      screen.getByText(
        /Nouvelle lune|Premier croissant|Premier quartier|Lune gibbeuse croissante|Pleine lune|Lune gibbeuse décroissante|Dernier quartier|Dernier croissant/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Périodes solunaires')).toBeInTheDocument()
    expect(await screen.findAllByText(/Majeure|Mineure/)).not.toHaveLength(0)
  })

  it('does not show the GPS-unavailable badge once a GPS fix is available', () => {
    mockGpsReading = {
      status: 'available',
      value: { lat: 46.8, lng: -71.2, accuracyMeters: 5 },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    render(<TemporalPage />)

    expect(
      screen.queryByText('Position de la carte utilisée — GPS indisponible'),
    ).not.toBeInTheDocument()
  })

  it('navigates to the next/previous day and updates the header label', async () => {
    const user = userEvent.setup()
    render(<TemporalPage />)

    expect(screen.getByText('Aujourd’hui')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Jour suivant' }))
    expect(screen.queryByText('Aujourd’hui')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Jour précédent' }))
    expect(screen.getByText('Aujourd’hui')).toBeInTheDocument()
  })

  it('shows the shared Phase 10 timeline cursor on the day bar when windStore has a real hour selected', () => {
    useWindStore.setState({ selectedHourOffset: 15 }) // hour-of-day 15
    render(<TemporalPage />)

    expect(
      screen.getByLabelText('Heure sélectionnée (curseur partagé de la ligne du temps)'),
    ).toBeInTheDocument()
  })
})
