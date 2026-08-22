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
  mockGpsReading = { status: 'unavailable', reason: 'Geolocation is not supported by this browser.' }
  useWindStore.setState({ selectedHourOffset: 0 })
})

describe('TemporalPage', () => {
  it('renders real sun, moon, and solunar data for the map-center fallback location', async () => {
    render(<TemporalPage />)

    expect(screen.getByText('Using map location — GPS unavailable')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
    expect(screen.getByText('Moon')).toBeInTheDocument()
    // A real phase name (one of the 8) must be shown, not a placeholder.
    expect(
      screen.getByText(/New Moon|Waxing Crescent|First Quarter|Waxing Gibbous|Full Moon|Waning Gibbous|Last Quarter|Waning Crescent/),
    ).toBeInTheDocument()
    expect(screen.getByText('Solunar periods')).toBeInTheDocument()
    expect(await screen.findAllByText(/Major|Minor/)).not.toHaveLength(0)
  })

  it('does not show the GPS-unavailable badge once a GPS fix is available', () => {
    mockGpsReading = {
      status: 'available',
      value: { lat: 46.8, lng: -71.2, accuracyMeters: 5 },
      confidence: 'measured',
      source: 'browser-geolocation',
    }
    render(<TemporalPage />)

    expect(screen.queryByText('Using map location — GPS unavailable')).not.toBeInTheDocument()
  })

  it('navigates to the next/previous day and updates the header label', async () => {
    const user = userEvent.setup()
    render(<TemporalPage />)

    expect(screen.getByText('Today')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.queryByText('Today')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(screen.getByText('Today')).toBeInTheDocument()
  })

  it('shows the shared Phase 10 timeline cursor on the day bar when windStore has a real hour selected', () => {
    useWindStore.setState({ selectedHourOffset: 15 }) // hour-of-day 15
    render(<TemporalPage />)

    expect(screen.getByLabelText('Selected hour (shared timeline cursor)')).toBeInTheDocument()
  })
})
