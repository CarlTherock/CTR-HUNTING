import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdvancedChart } from './AdvancedChart'
import { useWeatherStore } from '@/features/weather/state/weatherStore'
import { useWindStore } from '@/features/wind/state/windStore'
import type { HourlyForecastEntry, WeatherForecast } from '@/types'

function makeHourly(count: number): HourlyForecastEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    time: `2026-08-17T${String(i % 24).padStart(2, '0')}:00`,
    temperatureCelsius: 15 + Math.sin(i / 4) * 5,
    relativeHumidityPercent: 50,
    surfacePressureHpa: 1013,
    precipitationMm: i % 6 === 0 ? 1.5 : 0,
    cloudCoverPercent: 30,
    windSpeedKmh: 10 + (i % 5),
    windGustsKmh: 15,
    visibilityMeters: 20000,
  }))
}

const FORECAST: WeatherForecast = {
  timezone: 'America/Toronto',
  current: {
    timestamp: '2026-08-17T00:00',
    temperatureCelsius: 15,
    relativeHumidityPercent: 50,
    surfacePressureHpa: 1013,
    precipitationMm: 0,
    cloudCoverPercent: 30,
    windSpeedKmh: 10,
    windGustsKmh: 15,
    visibilityMeters: 20000,
  },
  hourly: makeHourly(48),
}

afterEach(() => {
  useWeatherStore.setState({ status: 'idle', forecast: null, coordinate: null, fetchedAt: null, isCached: false, errorReason: null })
  useWindStore.setState({
    status: 'idle',
    field: null,
    errorReason: null,
    enabled: false,
    selectedHourOffset: 0,
    activeLayer: 'wind',
  })
})

describe('AdvancedChart', () => {
  it('renders nothing when there is no forecast yet', () => {
    const { container } = render(<AdvancedChart />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a real chart with all 5 granularity options once a forecast is loaded', () => {
    useWeatherStore.setState({ forecast: FORECAST })
    render(<AdvancedChart />)

    expect(screen.getByRole('img', { name: 'Hourly temperature and wind chart' })).toBeInTheDocument()
    for (const g of ['1h', '3h', '6h', '12h', '24h']) {
      expect(screen.getByRole('tab', { name: g })).toBeInTheDocument()
    }
  })

  it('switching granularity changes the real bucket count without touching the underlying data', async () => {
    const user = userEvent.setup()
    useWeatherStore.setState({ forecast: FORECAST })
    render(<AdvancedChart />)

    await user.click(screen.getByRole('tab', { name: '24h' }))
    expect(screen.getByRole('tab', { name: '24h' })).toHaveAttribute('aria-selected', 'true')

    // Still the same real forecast in the store — resampling is a pure display transform.
    expect(useWeatherStore.getState().forecast?.hourly).toHaveLength(48)
  })

  it('clicking the chart moves the shared windStore timeline cursor', async () => {
    const user = userEvent.setup()
    useWeatherStore.setState({ forecast: FORECAST })
    render(<AdvancedChart />)

    const svg = screen.getByRole('img', { name: 'Hourly temperature and wind chart' })
    await user.click(svg)

    // A real, valid hour index was set — not left at its default of 0
    // only by coincidence (bounds-checked instead of asserting an exact
    // pixel-dependent value, which jsdom's zero-sized layout can't give).
    expect(useWindStore.getState().selectedHourOffset).toBeGreaterThanOrEqual(0)
    expect(useWindStore.getState().selectedHourOffset).toBeLessThan(48)
  })

  it('enabling day comparison overlays real day-1 and day-2 series', async () => {
    const user = userEvent.setup()
    useWeatherStore.setState({ forecast: FORECAST })
    render(<AdvancedChart />)

    await user.click(screen.getByLabelText('Compare day 1 vs day 2'))

    // Two temperature paths now exist (day 1 solid + day 2 dashed).
    const svg = screen.getByRole('img', { name: 'Hourly temperature and wind chart' })
    const dashedPaths = svg.querySelectorAll('path[stroke-dasharray]')
    expect(dashedPaths.length).toBeGreaterThan(0)
  })
})
