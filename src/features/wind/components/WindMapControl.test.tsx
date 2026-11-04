import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { WindField } from '@/types'
import { db } from '@/database/db'
import { DEFAULT_WIND_STYLE } from '@/utils/windStyle'
import { useWindStyleStore } from '@/features/weather-map/state/windStyleStore'
import { useWeatherMapStore } from '@/features/weather-map/state/weatherMapStore'
import { useWindAnalysisStore } from '../state/windAnalysisStore'
import { useWindPanelStore } from '../state/windPanelStore'
import { useWindStore } from '../state/windStore'
import { WindMapControl } from './WindMapControl'

const NOW = new Date('2026-11-03T19:00:00Z') // 14:00 in Toronto
const hours = Array.from({ length: 48 }, (_, i) => {
  const day = i < 24 ? '2026-11-03' : '2026-11-04'
  return {
    time: `${day}T${String(i % 24).padStart(2, '0')}:00`,
    directionDegrees: 315,
    speedKmh: 10 + i,
    gustsKmh: 30 + i,
    temperatureCelsius: 4,
    precipitationMm: 0,
    cloudCoverPercent: 10,
  }
})
const field: WindField = {
  timezone: 'America/Toronto',
  samples: [{ coordinate: { lat: 46.8, lng: -71.2 }, hourly: hours }],
}
const here = { lat: 46.8, lng: -71.2 }
const bounds = { west: -71.5, south: 46.5, east: -70.9, north: 47.1 }

function setup() {
  return render(<WindMapControl getBounds={() => bounds} viewCenter={here} />)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useWindStore.setState({
    field,
    status: 'available',
    enabled: true,
    selectedHourOffset: 14,
    fetchedAt: NOW.toISOString(),
    animationPaused: false,
    fetch: vi.fn(),
  })
})

afterEach(async () => {
  vi.useRealTimers()
  await db.settings.clear()
  useWindPanelStore.setState({ open: false })
  useWindAnalysisStore.setState({ open: false })
  useWindStyleStore.setState({ style: DEFAULT_WIND_STYLE, loaded: false })
  useWeatherMapStore.setState({ enabled: false })
})

describe('WindMapControl — panneau Vent', () => {
  it('opens on the wind NOW when the cursor was untouched, never over a deliberate hour', async () => {
    useWindStore.setState({ selectedHourOffset: 0 })
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    expect(useWindStore.getState().selectedHourOffset).toBe(14)

    await user.click(screen.getByRole('button', { name: 'Fermer le panneau du vent' }))
    useWindStore.setState({ selectedHourOffset: 20 })
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    expect(useWindStore.getState().selectedHourOffset).toBe(20)
  })

  it('has its own « Vent » button; the panel is closed until it is pressed', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    expect(screen.queryByTestId('wind-bottom-panel')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    expect(screen.getByTestId('wind-bottom-panel')).toBeInTheDocument()
    expect(screen.getByText(/Prévision réelle · Open-Meteo/)).toBeInTheDocument()
  })

  it('reads the real wind at the selected hour, from where it blows', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    const reading = screen.getByTestId('wind-center-reading')
    expect(reading).toHaveTextContent('Vent du NO (315°)')
    expect(reading).toHaveTextContent('24 km/h') // 10 + index 14
    expect(reading).toHaveTextContent('rafales 44 km/h')
    expect(screen.getByTestId('wind-hour-readout')).toHaveTextContent(/14:00/)
  })

  it('previous / next hour and « Maintenant » move the shared hour cursor', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    await user.click(screen.getByRole('button', { name: 'Heure suivante' }))
    expect(useWindStore.getState().selectedHourOffset).toBe(15)
    await user.click(screen.getByRole('button', { name: 'Heure précédente' }))
    await user.click(screen.getByRole('button', { name: 'Heure précédente' }))
    expect(useWindStore.getState().selectedHourOffset).toBe(13)
    await user.click(screen.getByRole('button', { name: 'Maintenant' }))
    expect(useWindStore.getState().selectedHourOffset).toBe(14)
  })

  it('does not fake a reading when no forecast is loaded', async () => {
    useWindStore.setState({ field: null, status: 'idle' })
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    expect(screen.getByTestId('wind-center-reading')).toHaveTextContent(
      'Aucune prévision de vent chargée',
    )
    expect(screen.queryByTestId('wind-hour-controls')).toBeNull()
  })

  it('shows the presentation settings and saves them', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    const size = screen.getByRole('radiogroup', { name: 'Taille du vent' })
    await user.click(within(size).getByRole('radio', { name: 'Très grand' }))
    expect(useWindStyleStore.getState().style.size).toBe('xlarge')
  })

  it('folds to a compact row with speed and play/pause, and unfolds again', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    await user.click(screen.getByRole('button', { name: 'Réduire le panneau du vent' }))
    expect(screen.getByTestId('wind-compact')).toHaveTextContent('24 km/h du NO')
    await user.click(screen.getByRole('button', { name: 'Pause du vent' }))
    expect(useWindStore.getState().animationPaused).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Déplier le panneau du vent' }))
    expect(screen.getByTestId('wind-hour-controls')).toBeInTheDocument()
  })

  it('« Analyse du vent » hands over to the analysis panel', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined })
    setup()
    await user.click(screen.getByRole('button', { name: 'Vent' }))
    await user.click(screen.getByRole('button', { name: 'Analyse du vent' }))
    expect(useWindAnalysisStore.getState().open).toBe(true)
    expect(screen.queryByTestId('wind-bottom-panel')).toBeNull()
  })
})
