import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeatherPage } from './WeatherPage'
import { db } from '@/database/db'
import { putSavedForecast } from '@/database/savedForecastsRepository'
import { useMapStore } from '@/features/map/state/mapStore'
import { useHuntingRuleStore } from '@/features/hunting-hours/huntingRuleStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { useSavedForecastsStore } from '../offline/savedForecastsStore'
import { useWeatherStore } from '../state/weatherStore'
import { buildSavedForecast, windZoneBounds } from '../offline/savedForecastLogic'
import { QUEBEC, makePoint, makeWindField } from '../offline/savedForecastFixtures'

const fetchForecast = vi.fn()
const fetchPointForecast = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: {
    fetchForecast: (...a: unknown[]) => fetchForecast(...a),
    fetchPointForecast: (...a: unknown[]) => fetchPointForecast(...a),
  },
}))
vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => ({
    status: 'unavailable',
    kind: 'unavailable',
    reason: 'test',
  }),
}))

const C = QUEBEC.coordinate
const NOW = new Date('2026-11-03T15:00:00Z') // 10:00 on 3 Nov in Toronto

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  setOnline(true)
  useMapStore.setState({ view: { center: C, zoom: 12, pitch: 0, bearing: 0 } })
  fetchForecast.mockRejectedValue(new Error('legacy unused'))
})

afterEach(async () => {
  vi.useRealTimers()
  vi.clearAllMocks()
  setOnline(true)
  await db.settings.clear()
  await db.savedForecasts.clear()
  useWeatherStore.setState({
    status: 'idle',
    forecast: null,
    coordinate: null,
    fetchedAt: null,
    isCached: false,
    errorReason: null,
    pointStatus: 'idle',
    point: null,
    pointError: null,
  })
  useSavedForecastsStore.setState({ items: [], loaded: false })
  useHuntingRuleStore.setState({ ruleId: null, loaded: false })
  useWindStore.setState({ field: null, selectedHourOffset: 0, status: 'idle' })
})

describe('Météo page — prévisions du lieu', () => {
  it('online: day selector, main card, sun, hourly rows and details', async () => {
    fetchPointForecast.mockResolvedValue(makePoint('2026-11-03', 5))
    render(<WeatherPage />)
    expect(await screen.findByTestId('main-weather')).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: 'Jour de la prévision météo' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { pressed: true })[0]).toBeInTheDocument()
    expect(screen.getByTestId('weather-place')).toHaveTextContent('Centre de la carte')
    expect(screen.getByTestId('weather-updated')).toHaveTextContent(/Mise à jour/)
    expect(screen.getByText('En ligne')).toBeInTheDocument()
    expect(screen.getByTestId('main-wind')).toHaveTextContent('du O (270°)')
    expect(screen.getByTestId('sunrise')).toHaveTextContent(/^\d\d:\d\d$/)
    expect(screen.getByRole('list', { name: 'Prévisions horaires' })).toBeInTheDocument()
    expect(screen.getByTestId('weather-details')).toHaveTextContent('Humidité')
    // The header shortcut and the download card's own button.
    expect(
      screen.getAllByRole('button', { name: 'Télécharger pour ma sortie' }),
    ).toHaveLength(2)
  })

  it('an hour can be chosen and moves the wind analysis to that hour', async () => {
    useWindStore.setState({
      field: makeWindField(C, '2026-11-03', 3),
      status: 'available',
    })
    fetchPointForecast.mockResolvedValue(makePoint('2026-11-03', 5))
    const user = userEvent.setup({ advanceTimers: () => undefined })
    render(<WeatherPage />)
    await screen.findByTestId('main-weather')
    await user.click(
      screen.getByRole('button', { name: '15:00 : voir le vent de cette heure' }),
    )
    expect(useWindStore.getState().selectedHourOffset).toBe(15)
    // A later day: the cursor moves to that day's default hour (12:00 → 24 + 12).
    await user.click(screen.getByRole('button', { name: /mer\. 4/ }))
    expect(useWindStore.getState().selectedHourOffset).toBe(24 + 12)
  })

  it('says so when the chosen hour is outside the loaded wind period', async () => {
    useWindStore.setState({
      field: makeWindField(C, '2026-11-03', 1),
      status: 'available',
    })
    useWindStore.getState().setSelectedHourOffset(3)
    fetchPointForecast.mockResolvedValue(makePoint('2026-11-03', 5))
    const user = userEvent.setup({ advanceTimers: () => undefined })
    render(<WeatherPage />)
    await screen.findByTestId('main-weather')
    await user.click(screen.getByRole('button', { name: /jeu\. 5/ }))
    expect(
      await screen.findByText(/hors de la période du vent chargé/),
    ).toBeInTheDocument()
    expect(useWindStore.getState().selectedHourOffset).toBe(3)
  })

  it('shows « indisponible » for absent optional values, never 0', async () => {
    fetchPointForecast.mockResolvedValue(
      makePoint('2026-11-03', 5, {
        patch: () => ({
          visibilityMeters: null,
          uvIndex: null,
          relativeHumidityPercent: null,
        }),
      }),
    )
    render(<WeatherPage />)
    const details = await screen.findByTestId('weather-details')
    expect(within(details).getAllByText('indisponible').length).toBeGreaterThanOrEqual(3)
    expect(details.textContent).not.toMatch(/(^|[^\d])0 %/)
  })
})

describe('Météo page — hors ligne', () => {
  async function saveDownload(fetchedAt = '2026-11-02T14:00:00.000Z') {
    await putSavedForecast(
      buildSavedForecast({
        id: 'dl',
        place: QUEBEC,
        point: makePoint('2026-11-02', 3),
        windField: makeWindField(C, '2026-11-02', 3),
        windBounds: windZoneBounds(C),
        requestedDays: 3,
        fetchedAt,
      }),
    )
  }

  it('offline: shows the downloaded forecast with the saved wording and no request', async () => {
    await saveDownload()
    setOnline(false)
    render(<WeatherPage />)
    expect(await screen.findByTestId('main-weather')).toBeInTheDocument()
    expect(screen.getByTestId('weather-updated')).toHaveTextContent(
      /Hors ligne — prévisions téléchargées le/,
    )
    expect(
      screen.getByText(/ce sont des prévisions, pas des mesures en direct/),
    ).toBeInTheDocument()
    expect(fetchPointForecast).not.toHaveBeenCalled()
    expect(fetchForecast).not.toHaveBeenCalled()
    // Only the days the download still covers (3 and 4 Nov), none of the past.
    const days = screen.getByRole('group', { name: 'Jour de la prévision météo' })
    expect(within(days).getAllByRole('button')).toHaveLength(2)
  })

  it('offline with nothing saved for this place: the explicit message', async () => {
    setOnline(false)
    render(<WeatherPage />)
    expect(
      await screen.findByText('Aucune prévision enregistrée pour ce lieu et cette date.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('main-weather')).toBeNull()
  })

  it('never uses a download made for another place', async () => {
    await saveDownload()
    setOnline(false)
    useMapStore.setState({
      view: { center: { lat: 45.5, lng: -73.6 }, zoom: 12, pitch: 0, bearing: 0 },
    })
    render(<WeatherPage />)
    expect(
      await screen.findByText('Aucune prévision enregistrée pour ce lieu et cette date.'),
    ).toBeInTheDocument()
  })

  it('reports an ended download instead of reusing it for today', async () => {
    await saveDownload('2026-10-20T14:00:00.000Z')
    await db.savedForecasts.clear()
    await putSavedForecast(
      buildSavedForecast({
        id: 'old',
        place: QUEBEC,
        point: makePoint('2026-10-20', 3),
        windField: makeWindField(C, '2026-10-20', 3),
        windBounds: windZoneBounds(C),
        requestedDays: 3,
        fetchedAt: '2026-10-20T14:00:00.000Z',
      }),
    )
    setOnline(false)
    render(<WeatherPage />)
    expect(
      await screen.findByText(/période de la prévision téléchargée .* est terminée/),
    ).toBeInTheDocument()
  })

  it('flags old downloads', async () => {
    await saveDownload('2026-11-02T14:00:00.000Z') // > 12 h before NOW
    setOnline(false)
    render(<WeatherPage />)
    expect(await screen.findByTestId('weather-updated')).toHaveTextContent(
      /Prévisions anciennes/,
    )
  })
})

describe('Soleil et heures de chasse', () => {
  it('shows the sun first and no window until the person chooses the rule', async () => {
    fetchPointForecast.mockResolvedValue(makePoint('2026-11-03', 5))
    const user = userEvent.setup({ advanceTimers: () => undefined })
    render(<WeatherPage />)
    const card = await screen.findByTestId('sun-hunting')
    expect(within(card).getByTestId('sunrise')).toHaveTextContent(/^\d\d:\d\d$/)
    expect(within(card).getByTestId('no-window')).toHaveTextContent(
      /Aucune règle de chasse choisie/,
    )
    expect(within(card).queryByTestId('window')).toBeNull()

    await user.click(
      await within(card).findByRole('button', { name: /Je chasse au Québec/ }),
    )
    const windowEl = await within(card).findByTestId('window')
    expect(windowEl).toHaveTextContent(/^\d\d:\d\d – \d\d:\d\d$/)
    expect(card).toHaveTextContent('Plage horaire calculée (pas une autorisation)')
    expect(card).toHaveTextContent('Règle appliquée : Québec — règle générale')
    expect(card).toHaveTextContent(
      /Dans la plage horaire calculée|Avant le début|Après la fin/,
    )
    expect(card).not.toHaveTextContent(/chasse autorisée/i)
    expect(card).toHaveTextContent(/n’est pas vérifiée par l’application/)
  })

  it('refuses the Québec rule for a place outside Québec', async () => {
    useHuntingRuleStore.setState({ ruleId: 'quebec-general', loaded: true })
    useMapStore.setState({
      view: { center: { lat: 53.5, lng: -113.5 }, zoom: 12, pitch: 0, bearing: 0 },
    })
    fetchPointForecast.mockResolvedValue(
      makePoint('2026-11-03', 5, { timezone: 'America/Edmonton' }),
    )
    render(<WeatherPage />)
    const card = await screen.findByTestId('sun-hunting')
    expect(card).toHaveTextContent(/hors du Québec/)
    expect(within(card).queryByTestId('window')).toBeNull()
    expect(within(card).getByTestId('sunrise')).toHaveTextContent(/^\d\d:\d\d$/)
  })

  it('keeps the source, the verification date and the exceptions reachable', async () => {
    fetchPointForecast.mockResolvedValue(makePoint('2026-11-03', 5))
    render(<WeatherPage />)
    const card = await screen.findByTestId('sun-hunting')
    expect(card).toHaveTextContent('Source, règle et limites')
    expect(card).toHaveTextContent(/Dindon sauvage/)
    expect(card).toHaveTextContent(/règle vérifiée le/)
    expect(within(card).getByRole('link', { name: /Québec\.ca/ })).toHaveAttribute(
      'href',
      expect.stringContaining('quebec.ca'),
    )
  })
})
