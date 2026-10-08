import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { NOW, makeWindField } from '@/features/analytics/testFixtures'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { Observation, Track, VegetationSample, Waypoint } from '@/types'
import type { CompareDataset } from '../compareData'
import { useCompareStore } from '../state/compareStore'
import { ComparePanel } from './ComparePanel'

let gpsReading: GeolocationReading = {
  status: 'unavailable',
  kind: 'searching',
  reason: 'En attente d’un signal GPS.',
}
vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => gpsReading,
}))

function wp(id: string, lat: number, extra: Partial<Waypoint> = {}): Waypoint {
  return {
    id,
    name: `Cache ${id}`,
    coordinate: { lat, lng: -71.2 },
    category: 'stand_blind',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...extra,
  }
}

const A = wp('a', 46.8, { optimalWindDirections: [270] })
const B = wp('b', 46.82, { optimalWindDirections: [90] })
const C = wp('c', 46.84)
const SIGN = wp('sign', 46.8004, { category: 'game_sign', name: 'Frottis' })

const JOURNAL: Observation = {
  id: 'j1',
  coordinate: { lat: 46.8002, lng: -71.2 },
  timestamp: '2026-08-12T08:00:00.000Z',
  notes: 'Traces fraîches',
}
const TRACK: Track = {
  id: 't1',
  name: 'Sortie',
  startedAt: '2026-08-10T10:00:00.000Z',
  points: [{ lat: 46.8, lng: -71.2, timestamp: '2026-08-10T10:00:00.000Z' }],
}

function vegetation(lat: number, counts: VegetationSample['categoryCounts']) {
  return {
    coordinate: { lat, lng: -71.2 },
    radiusMeters: 300,
    categoryCounts: counts,
    source: 'openstreetmap' as const,
  }
}

function dataset(overrides: Partial<CompareDataset> = {}): CompareDataset {
  return {
    key: 'k',
    bounds: { south: 46.7, west: -71.3, north: 46.9, east: -71.1 },
    windField: makeWindField([A.coordinate, B.coordinate, C.coordinate]),
    wind: { status: 'ok', fetchedAt: '2026-08-17T18:10:00.000Z' },
    windOrigin: 'network',
    windOriginLabel: null,
    vegetation: [vegetation(46.8, { forest: 1 }), vegetation(46.82, { developed: 1 })],
    vegetationState: { status: 'ok', fetchedAt: '2026-08-17T18:11:00.000Z' },
    vegetationOrigin: 'network',
    ...overrides,
  }
}

function LocationProbe() {
  return <p data-testid="path">{useLocation().pathname}</p>
}

const load = vi.fn(() => Promise.resolve())
const refresh = vi.fn(() => Promise.resolve())

function seed(
  selected: string[] = ['a', 'b'],
  data: CompareDataset | null = dataset(),
  status: 'idle' | 'loading' | 'ready' = 'ready',
) {
  const all = [A, B, C, SIGN]
  useWaypointsStore.setState({ waypoints: all, loaded: true })
  useCompareStore.setState({
    selectedIds: selected,
    panelOpen: true,
    hourKey: null,
    status,
    dataset: data,
    loadedAt: '2026-08-17T18:12:00.000Z',
    records: {
      waypoints: all,
      tracks: [TRACK],
      observations: [JOURNAL],
      readAt: '2026-08-17T18:12:00.000Z',
    },
    load,
    refresh,
  })
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/waypoints']}>
      <ComparePanel />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function stubWide(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query.includes('min-width: 1024px'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  load.mockClear()
  refresh.mockClear()
  gpsReading = {
    status: 'unavailable',
    kind: 'searching',
    reason: 'En attente d’un signal GPS.',
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useCompareStore.setState({
    selectedIds: [],
    panelOpen: false,
    status: 'idle',
    dataset: null,
    hourKey: null,
  })
  useWaypointsStore.setState({ waypoints: [], loaded: false, editingId: null })
  useGuidanceStore.setState({ destinationId: null, notice: null })
  useJournalStore.setState({ editingId: null })
})

describe('ComparePanel — content', () => {
  it('shows the disclaimer, the ranking rules and one stacked card per waypoint on small screens', () => {
    seed()
    renderPanel()
    expect(
      screen.getByText(
        'Comparaison indicative : ce n’est pas une prévision de réussite.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByTestId('compare-cards')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByText('Critères et règles du tri')).toBeInTheDocument()
  })

  it('shows coverage, wind with source and hour, preference, conditions, habitat and missing data per card', () => {
    seed()
    renderPanel()
    const card = screen.getByRole('article', { name: 'Comparaison : Cache a' })
    expect(within(card).getByText('5/5 critères évaluables')).toBeInTheDocument()
    expect(
      within(card).getByText(/O \(270°\) · 12 km\/h · rafales 20 km\/h/),
    ).toBeInTheDocument()
    expect(within(card).getAllByText(/Source : Open-Meteo/)).toHaveLength(2)
    expect(within(card).getByText(/Compatible\./)).toBeInTheDocument()
    expect(within(card).getAllByText(/Actuel/).length).toBeGreaterThan(0)
    expect(within(card).getByText('Renseigné')).toBeInTheDocument()
    const cardB = screen.getByRole('article', { name: 'Comparaison : Cache b' })
    expect(within(cardB).getByText(/Non compatible\./)).toBeInTheDocument()
    expect(within(cardB).getByText('4/5 critères évaluables')).toBeInTheDocument()
    expect(
      within(cardB).getByText(/Signes de gibier : aucun enregistré à moins de 400 m/, {
        selector: 'li',
      }),
    ).toBeInTheDocument()
  })

  it('shows the three observation counts separately and animals as unavailable', () => {
    seed()
    renderPanel()
    const card = screen.getByRole('article', { name: 'Comparaison : Cache a' })
    expect(within(card).getByText(/Visites \(traces GPS\) :/).textContent).toContain('1')
    expect(within(card).getByText(/Signes de gibier :/).textContent).toContain('1')
    expect(within(card).getByText(/Entrées de journal :/).textContent).toContain('1')
    expect(
      within(card).getByText(/Animaux observés : non disponible/),
    ).toBeInTheDocument()
  })

  it('says "position indisponible" without a usable GPS, and gives a distance with a fresh one', () => {
    seed()
    const { unmount } = renderPanel()
    // Une fois dans la section Distance, une fois dans les données manquantes, par point.
    expect(screen.getAllByText(/Position indisponible/).length).toBe(4)
    unmount()
    gpsReading = {
      status: 'available',
      confidence: 'measured',
      source: 'browser-geolocation',
      value: {
        lat: 46.8,
        lng: -71.2,
        accuracyMeters: 6,
        timestampMs: NOW.getTime() - 2000,
      },
    }
    renderPanel()
    expect(screen.queryByText(/Position indisponible/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/à vol d’oiseau/)).toHaveLength(2)
    expect(screen.getAllByText(/Précision ±6 m/).length).toBe(2)
  })

  it('lists the ranking, with the criteria used, when the points can be ordered', () => {
    seed()
    renderPanel()
    expect(screen.getByText('Classement par critères')).toBeInTheDocument()
    expect(
      screen.getByText(/Tri par nombre de critères satisfaits parmi les/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Rang 1/, { selector: 'li span' })).toBeInTheDocument()
  })

  it('says the points are not comparable instead of ranking them when data are missing', () => {
    seed(
      ['a', 'b'],
      dataset({ windField: null, wind: { status: 'error', reason: 'hors ligne' } }),
    )
    renderPanel()
    expect(screen.getByText('Points non comparables')).toBeInTheDocument()
    expect(screen.queryByText('Classement par critères')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Non classé \(trop de données manquantes\)/).length).toBe(
      2,
    )
    expect(screen.getByRole('alert').textContent).toContain('hors ligne')
  })

  it('invites to select at least two waypoints', () => {
    seed(['a'])
    renderPanel()
    expect(
      screen.getByText(/Sélectionnez au moins 2 points de repère/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('shows a loading state instead of stale results', () => {
    seed(['a', 'b'], dataset(), 'loading')
    renderPanel()
    expect(screen.getByRole('status').textContent).toContain('Chargement')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('loads on open (once) through the store', () => {
    seed()
    renderPanel()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('"Actualiser" asks the store to refresh', () => {
    seed()
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /Actualiser/ }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('ComparePanel — chosen hour', () => {
  it('only offers hours present in the loaded data and switches without any request', () => {
    seed()
    renderPanel()
    const select = screen.getByLabelText(/Créneau horaire/)
    const options = within(select).getAllByRole('option')
    expect(options).toHaveLength(48)
    expect(
      screen.getByRole('article', { name: 'Comparaison : Cache a' }).textContent,
    ).toContain('Actuel')
    const loadsBefore = load.mock.calls.length
    fireEvent.change(select, { target: { value: '2026-08-17T18:00' } })
    const card = screen.getByRole('article', { name: 'Comparaison : Cache a' })
    expect(card.textContent).toContain('prévision pour 18:00')
    expect(within(card).getAllByText('Prévision').length).toBeGreaterThan(0)
    expect(load.mock.calls.length).toBe(loadsBefore)
  })

  it('has no selectable hour when no wind data are loaded', () => {
    seed(['a', 'b'], dataset({ windField: null, wind: { status: 'error', reason: 'x' } }))
    renderPanel()
    const select = screen.getByLabelText(/Créneau horaire/)
    expect(select).toBeDisabled()
    expect(within(select).getByText('Aucune heure disponible')).toBeInTheDocument()
  })
})

describe('ComparePanel — wide screens', () => {
  it('renders a comparison table inside its own scroll frame instead of cards', () => {
    stubWide(true)
    seed(['a', 'b', 'c'])
    renderPanel()
    expect(screen.queryByTestId('compare-cards')).not.toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4)
    const frame = screen.getByTestId('compare-table-scroll')
    expect(frame.className).toContain('overflow-x-auto')
    expect(frame.className).toContain('max-w-full')
    expect(within(table).getByText('Couverture')).toBeInTheDocument()
    expect(within(table).getAllByRole('button', { name: 'Aller à' })).toHaveLength(3)
  })
})

describe('ComparePanel — actions', () => {
  it('"Voir sur la carte" centres the shared map view on the waypoint without touching it', () => {
    seed()
    renderPanel()
    const before = JSON.stringify(useWaypointsStore.getState().waypoints)
    const card = screen.getByRole('article', { name: 'Comparaison : Cache b' })
    fireEvent.click(within(card).getByRole('button', { name: 'Voir sur la carte' }))
    expect(screen.getByTestId('path').textContent).toBe('/map')
    expect(useMapStore.getState().view.center).toEqual({ lat: 46.82, lng: -71.2 })
    expect(useMapStore.getState().view.zoom).toBeGreaterThanOrEqual(15)
    expect(JSON.stringify(useWaypointsStore.getState().waypoints)).toBe(before)
  })

  it('"Aller à" starts the existing guidance and opens the map', () => {
    seed()
    renderPanel()
    const card = screen.getByRole('article', { name: 'Comparaison : Cache a' })
    fireEvent.click(within(card).getByRole('button', { name: 'Aller à' }))
    expect(useGuidanceStore.getState().destinationId).toBe('a')
    expect(screen.getByTestId('path').textContent).toBe('/map')
  })

  it('"Ouvrir la fiche" opens the existing sheet for that waypoint', () => {
    seed()
    renderPanel()
    const card = screen.getByRole('article', { name: 'Comparaison : Cache b' })
    fireEvent.click(within(card).getByRole('button', { name: 'Ouvrir la fiche' }))
    expect(useWaypointsStore.getState().editingId).toBe('b')
    expect(screen.getByTestId('path').textContent).toBe('/waypoints')
  })

  it('"Consulter les observations associées" lists signs and journal entries with links', () => {
    seed()
    renderPanel()
    const card = screen.getByRole('article', { name: 'Comparaison : Cache a' })
    fireEvent.click(
      within(card).getByRole('button', { name: 'Consulter les observations associées' }),
    )
    const region = screen.getByRole('region', {
      name: 'Observations associées à Cache a',
    })
    expect(within(region).getByText(/Frottis/)).toBeInTheDocument()
    expect(within(region).getByText(/Traces fraîches/)).toBeInTheDocument()
    expect(within(region).getByText(/Animaux observés/)).toBeInTheDocument()
    expect(region.textContent).toContain('tous territoires confondus')

    fireEvent.click(
      within(region).getByRole('button', { name: /Ouvrir la fiche : Frottis/ }),
    )
    expect(useWaypointsStore.getState().editingId).toBe('sign')

    fireEvent.click(
      within(region).getByRole('button', { name: /Ouvrir l’entrée : Traces fraîches/ }),
    )
    expect(useJournalStore.getState().editingId).toBe('j1')
    expect(screen.getByTestId('path').textContent).toBe('/journal')
  })

  it('toggles the associated observations off with the same button', () => {
    seed()
    renderPanel()
    const card = screen.getByRole('article', { name: 'Comparaison : Cache a' })
    const button = within(card).getByRole('button', {
      name: 'Consulter les observations associées',
    })
    fireEvent.click(button)
    expect(
      screen.getByRole('region', { name: /Observations associées/ }),
    ).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.queryByRole('region', { name: /Observations associées/ })).toBeNull()
  })
})
