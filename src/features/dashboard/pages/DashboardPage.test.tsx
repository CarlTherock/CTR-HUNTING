import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { db } from '@/database/db'
import { installPermissionSpies } from '@/test/permissionSpies'
import { useBackupStore } from '@/features/backup/state/backupStore'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useWeatherStore } from '@/features/weather/state/weatherStore'
import type { OfflineArea, Territory, Waypoint, WeatherForecast } from '@/types'
import { DashboardPage } from './DashboardPage'

/**
 * Home page. All data comes from stores seeded by the tests (no map, no real
 * network); the weather provider is replaced by a stub, so what is proven is
 * the page's logic and wording, not the Open-Meteo service.
 */
const fetchForecast = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchForecast: (...args: unknown[]) => fetchForecast(...args) },
}))

const WAYPOINT: Waypoint = {
  id: 'w1',
  name: 'Mirador nord',
  coordinate: { lat: 46.801, lng: -71.2 },
  category: 'stand_blind',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const FORECAST: WeatherForecast = {
  timezone: 'America/Toronto',
  current: {
    timestamp: '2026-10-07T14:00',
    temperatureCelsius: 8,
    relativeHumidityPercent: 60,
    surfacePressureHpa: 1012,
    precipitationMm: 0,
    cloudCoverPercent: 40,
    windSpeedKmh: 12,
    windGustsKmh: 25,
    visibilityMeters: 10000,
  },
  hourly: ['14', '15', '16', '17'].map((h) => ({
    time: `2026-10-07T${h}:00`,
    temperatureCelsius: 7,
    relativeHumidityPercent: 60,
    surfacePressureHpa: 1012,
    precipitationMm: 0,
    cloudCoverPercent: 40,
    windSpeedKmh: 15,
    windGustsKmh: 25,
    visibilityMeters: 10000,
  })),
}

function area(id: string, status: OfflineArea['status']): OfflineArea {
  return { id, name: id, status } as OfflineArea
}

function resetStores() {
  useWaypointsStore.setState({ waypoints: [], loaded: true })
  useTracksStore.setState({ tracks: [], loaded: true, status: 'idle', recordingId: null })
  useJournalStore.setState({ observations: [], loaded: true })
  useOfflineStore.setState({ areas: [], loaded: true, mode: 'idle' })
  useTerritoriesStore.setState({ territories: [], loaded: true, filter: { kind: 'all' } })
  useGuidanceStore.setState({ destinationId: null, notice: null })
  useBackupStore.setState({
    statusLoaded: true,
    lastBackupAt: null,
    counts: { waypoints: 0, tracks: 0, observations: 0 },
    dismissedUntil: null,
    persistence: 'denied',
  })
  useWeatherStore.setState({
    status: 'idle',
    forecast: null,
    coordinate: null,
    fetchedAt: null,
    isCached: false,
    errorReason: null,
  })
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/map" element={<p>PAGE CARTE</p>} />
        <Route path="/help" element={<p>PAGE AIDE</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function card(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

beforeEach(() => {
  resetStores()
  fetchForecast.mockReset()
})

afterEach(async () => {
  await db.settings.clear()
})

describe('DashboardPage — empty states', () => {
  it('guides a new user instead of showing blanks', async () => {
    renderHome()

    expect(
      screen.getByRole('heading', { level: 1, name: 'CTR Hunting' }),
    ).toBeInTheDocument()
    expect(within(card('Carte')).getByText(/Aucun point de repère/)).toBeInTheDocument()
    expect(
      within(card('Carte')).getByRole('link', { name: 'Créer le premier' }),
    ).toHaveAttribute('href', '/map')
    expect(within(card('Destination active')).getByText(/Aucun guidage/)).toBeVisible()
    expect(
      within(card('Journal et dernière sortie')).getByText(/Aucune trace ni entrée/),
    ).toBeVisible()
    expect(
      within(card('Cartes téléchargées')).getByText(/Aucune zone téléchargée/),
    ).toBeVisible()
    expect(
      within(card('Territoire sélectionné')).getByText(/Aucun territoire/),
    ).toBeVisible()
    expect(
      within(card('Sauvegarde et données')).getByText('jamais', { exact: false }),
    ).toBeVisible()
  })

  it('says the weather is unavailable and offers a button, without any request by itself', async () => {
    renderHome()

    const weather = card('Météo et vent')
    expect(
      await within(weather).findByText(/Indisponible : aucune prévision/),
    ).toBeVisible()
    expect(
      within(weather).getByRole('button', { name: 'Charger la météo' }),
    ).toBeEnabled()
    expect(fetchForecast).not.toHaveBeenCalled()
  })
})

describe('DashboardPage — with data', () => {
  it('summarises waypoints, last outing, offline areas, territory filter and backup state', async () => {
    const territory: Territory = {
      id: 't1',
      name: 'Secteur nord',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    useWaypointsStore.setState({ waypoints: [WAYPOINT] })
    useTracksStore.setState({
      tracks: [
        {
          id: 'tr1',
          name: 'Sortie du matin',
          points: [],
          startedAt: '2026-10-05T10:00:00Z',
          endedAt: '2026-10-05T12:00:00Z',
        },
        // No end time and not being recorded: cut short.
        { id: 'tr2', name: 'Coupée', points: [], startedAt: '2026-10-01T10:00:00Z' },
      ],
    })
    useOfflineStore.setState({
      areas: [area('a', 'downloading'), area('b', 'cancelled'), area('c', 'error')],
    })
    useTerritoriesStore.setState({
      territories: [territory],
      filter: { kind: 'territory', id: 't1' },
    })
    useBackupStore.setState({
      lastBackupAt: new Date().toISOString(),
      counts: { waypoints: 1, tracks: 2, observations: 0 },
      persistence: 'granted',
    })

    renderHome()

    expect(
      within(card('Carte')).getByText('1 point(s) de repère enregistré(s).'),
    ).toBeVisible()
    expect(
      within(card('Journal et dernière sortie')).getByText('Sortie du matin'),
    ).toBeVisible()
    expect(
      within(card('Journal et dernière sortie')).getByText(/1 trace\(s\) interrompue/),
    ).toBeVisible()
    const offline = within(card('Cartes téléchargées'))
    expect(offline.getByText('1 · En cours')).toBeVisible()
    expect(offline.getByText('1 · Interrompue')).toBeVisible()
    expect(offline.getByText('1 · Échec')).toBeVisible()
    expect(offline.getByRole('link', { name: 'Réglages des cartes' })).toHaveAttribute(
      'href',
      '/settings',
    )
    const territoryCard = within(card('Territoire sélectionné'))
    expect(territoryCard.getByText(/Secteur nord/)).toBeVisible()
    expect(territoryCard.getByText('Filtre actif')).toBeVisible()
    const data = within(card('Sauvegarde et données'))
    expect(data.getByText(/3 élément\(s\) sur cet appareil/)).toBeVisible()
    expect(data.getByText('Stockage protégé : accordé')).toBeVisible()
  })

  it('shows the BackupReminder when the data is old and unsaved', () => {
    useBackupStore.setState({
      lastBackupAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      counts: { waypoints: 4, tracks: 0, observations: 0 },
    })

    renderHome()

    const data = within(card('Sauvegarde et données'))
    expect(data.getByRole('status')).toHaveTextContent(/dernière sauvegarde remonte/)
    expect(data.getByRole('link', { name: 'Sauvegarder maintenant' })).toBeVisible()
  })
})

describe('DashboardPage — weather and wind', () => {
  it('shows the saved forecast as « Enregistré », never as current, with its age', async () => {
    await db.settings.put({
      key: 'lastWeatherForecast',
      value: {
        coordinate: { lat: 46.8, lng: -71.2 },
        forecast: FORECAST,
        fetchedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      },
    })

    renderHome()

    const weather = within(card('Météo et vent'))
    expect(await weather.findByText('Enregistré')).toBeVisible()
    expect(weather.queryByText('Actuel')).not.toBeInTheDocument()
    expect(weather.getByText(/il y a 5 h/, { selector: 'span' })).toBeVisible()
    expect(weather.getByText(/8,0 °C · vent 12 km\/h \(rafales 25 km\/h\)/)).toBeVisible()
    expect(weather.getByText('Prévision')).toBeVisible()
    expect(fetchForecast).not.toHaveBeenCalled()
  })

  it('loads one real forecast on request for the map centre and labels it « Actuel » with its hour', async () => {
    const user = userEvent.setup()
    useMapStore.setState({
      view: { center: { lat: 47.1, lng: -70.9 }, zoom: 10, pitch: 0, bearing: 0 },
    })
    fetchForecast.mockResolvedValue(FORECAST)

    renderHome()
    const weather = card('Météo et vent')
    expect(within(weather).getByText(/le centre de la carte/)).toBeVisible()
    await user.click(within(weather).getByRole('button', { name: 'Charger la météo' }))

    expect(await within(weather).findByText('Actuel')).toBeVisible()
    expect(fetchForecast).toHaveBeenCalledWith({ lat: 47.1, lng: -70.9 })
    expect(within(weather).getByText(/14:00 \(heure du lieu\)/)).toBeVisible()
    expect(within(weather).getByRole('button', { name: 'Actualiser' })).toBeVisible()
  })

  it('shows an explicit error, not a made-up value, when the request fails with nothing saved', async () => {
    const user = userEvent.setup()
    fetchForecast.mockRejectedValue(new Error('réseau coupé'))

    renderHome()
    const weather = card('Météo et vent')
    await user.click(within(weather).getByRole('button', { name: 'Charger la météo' }))

    expect(
      await within(weather).findByText(/Météo indisponible : réseau coupé/),
    ).toBeVisible()
    expect(within(weather).queryByText(/°C/)).not.toBeInTheDocument()
  })

  it('disables the button and says why when the device is offline', () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    renderHome()

    const weather = card('Météo et vent')
    expect(
      within(weather).getByRole('button', { name: 'Charger la météo' }),
    ).toBeDisabled()
    expect(
      within(weather).getByText(/Hors ligne : l’actualisation est impossible/),
    ).toBeVisible()
    online.mockRestore()
  })
})

describe('DashboardPage — active destination', () => {
  it('resumes guidance on the map, and stops it on demand', async () => {
    const user = userEvent.setup()
    useWaypointsStore.setState({ waypoints: [WAYPOINT] })
    expect(useGuidanceStore.getState().start('w1')).toBe(true)

    renderHome()
    const guidance = card('Destination active')
    expect(within(guidance).getByText(/Mirador nord/)).toBeVisible()

    await user.click(within(guidance).getByRole('button', { name: 'Arrêter' }))
    expect(useGuidanceStore.getState().destinationId).toBeNull()
    expect(await within(guidance).findByText(/Aucun guidage/)).toBeVisible()
  })

  it('« Reprendre » opens the map without stopping the guidance', async () => {
    const user = userEvent.setup()
    useWaypointsStore.setState({ waypoints: [WAYPOINT] })
    useGuidanceStore.getState().start('w1')

    renderHome()
    await user.click(
      within(card('Destination active')).getByRole('button', { name: 'Reprendre' }),
    )

    expect(await screen.findByText('PAGE CARTE')).toBeVisible()
    expect(useGuidanceStore.getState().destinationId).toBe('w1')
  })
})

describe('DashboardPage — navigation and privacy of the home page', () => {
  it('links to the help, privacy and about pages', async () => {
    const user = userEvent.setup()
    renderHome()

    const nav = screen.getByRole('navigation', { name: 'Aide et informations' })
    expect(within(nav).getByRole('link', { name: 'Confidentialité' })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(within(nav).getByRole('link', { name: 'À propos' })).toHaveAttribute(
      'href',
      '/about',
    )
    await user.click(within(nav).getByRole('link', { name: 'Aide' }))
    expect(await screen.findByText('PAGE AIDE')).toBeVisible()
  })

  it('never asks for the position, the camera or the compass', async () => {
    const permissions = installPermissionSpies()

    renderHome()
    await waitFor(() => expect(card('Sauvegarde et données')).toBeVisible())

    permissions.expectNoPermissionAsked()
    permissions.restore()
  })
})
