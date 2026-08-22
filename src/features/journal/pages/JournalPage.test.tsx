import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { JournalPage } from './JournalPage'
import { db } from '@/database/db'
import { useJournalStore } from '../state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWeatherStore } from '@/features/weather/state/weatherStore'
import { useWindStore } from '@/features/wind/state/windStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'

let mockGpsReading: GeolocationReading = {
  status: 'unavailable',
  reason: 'Geolocation is not supported by this browser.',
}
vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => mockGpsReading,
}))

vi.mock('@/features/camera/components/CameraCapture', () => ({
  CameraCapture: () => null,
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  )
}

afterEach(async () => {
  await db.observations.clear()
  await db.photos.clear()
  mockGpsReading = { status: 'unavailable', reason: 'Geolocation is not supported by this browser.' }
  useJournalStore.setState({ observations: [], loaded: false, editingId: null })
  useWeatherStore.setState({ status: 'idle', forecast: null, coordinate: null, fetchedAt: null, isCached: false, errorReason: null })
  useWindStore.setState({ status: 'idle', field: null, errorReason: null, enabled: false, selectedHourOffset: 0, activeLayer: 'wind' })
})

describe('JournalPage', () => {
  it('shows the empty state with no entries', async () => {
    renderPage()

    expect(await screen.findByText('No journal entries yet')).toBeInTheDocument()
  })

  it('creates a real entry at the map-center fallback when GPS is unavailable, with no conditions snapshot when nothing is loaded', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'New entry' }))

    await vi.waitFor(async () => {
      expect(await db.observations.count()).toBe(1)
    })
    const [observation] = await db.observations.toArray()
    expect(observation.coordinate).toEqual(useMapStore.getState().view.center)
    expect(observation.conditions).toBeUndefined()
    expect(screen.getByPlaceholderText('What did you see?')).toBeInTheDocument()
  })

  it('attaches a real conditions snapshot when weather and wind data are already loaded', async () => {
    const user = userEvent.setup()
    const coordinate = useMapStore.getState().view.center
    useWeatherStore.setState({
      forecast: {
        timezone: 'UTC',
        current: {
          timestamp: '2026-08-17T10:00',
          temperatureCelsius: 15,
          relativeHumidityPercent: 50,
          surfacePressureHpa: 1013,
          precipitationMm: 0,
          cloudCoverPercent: 40,
          windSpeedKmh: 10,
          windGustsKmh: 15,
          visibilityMeters: 20000,
        },
        hourly: [],
      },
    })
    useWindStore.setState({
      field: {
        timezone: 'UTC',
        samples: [
          {
            coordinate,
            hourly: [
              {
                time: '2026-08-17T10:00',
                directionDegrees: 270,
                speedKmh: 12,
                gustsKmh: 20,
                temperatureCelsius: 15,
                precipitationMm: 0,
                cloudCoverPercent: 40,
              },
            ],
          },
        ],
      },
    })
    renderPage()

    await user.click(screen.getByRole('button', { name: 'New entry' }))

    await vi.waitFor(async () => {
      const [observation] = await db.observations.toArray()
      expect(observation.conditions).toEqual({
        temperatureCelsius: 15,
        windSpeedKmh: 12,
        windDirectionDegrees: 270,
        cloudCoverPercent: 40,
      })
    })
  })

  it('edits notes and lists the real entry with its notes/timestamp/coordinate', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'New entry' }))
    await screen.findByPlaceholderText('What did you see?')

    await user.type(screen.getByPlaceholderText('What did you see?'), 'Fresh rub line')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(await screen.findByText('Fresh rub line')).toBeInTheDocument()
  })

  it('deletes a real entry', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'New entry' }))
    await screen.findByPlaceholderText('What did you see?')

    await user.click(screen.getByRole('button', { name: 'Delete entry' }))

    await vi.waitFor(async () => {
      expect(await db.observations.count()).toBe(0)
    })
    expect(await screen.findByText('No journal entries yet')).toBeInTheDocument()
  })
})
