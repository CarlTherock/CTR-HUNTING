import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { navItems } from '@/app/navigation'
import { HeatmapCellSheet } from '@/features/analytics/components/HeatmapCellSheet'
import { useHeatmapStore } from '@/features/analytics/state/heatmapStore'
import { NOW, makeWeather, makeWindField } from '@/features/analytics/testFixtures'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { TerritoryManager } from '@/features/territories/components/TerritoryManager'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { buildGrid } from '@/utils/grid'
import { useAssistantStore } from './state/assistantStore'
import { sampleRecords } from './testFixtures'
import { AssistantPage } from './pages/AssistantPage'

const fetchWindField = vi.fn()
vi.mock('@/services/wind', () => ({
  windProvider: { fetchWindField: (...args: unknown[]) => fetchWindField(...args) },
}))
const fetchForecast = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchForecast: (...args: unknown[]) => fetchForecast(...args) },
}))
const fetchVegetationGrid = vi.fn()
vi.mock('@/services/vegetation', () => ({
  vegetationProvider: {
    fetchVegetationGrid: (...args: unknown[]) => fetchVegetationGrid(...args),
  },
}))

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }
const POINTS = buildGrid(BOUNDS, 8)

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function seedStores() {
  const records = sampleRecords()
  useWaypointsStore.setState({ waypoints: [...records.waypoints], loaded: true })
  useTracksStore.setState({ tracks: [...records.tracks], loaded: true })
  useJournalStore.setState({ observations: [...records.observations], loaded: true })
  useTerritoriesStore.setState({
    territories: [...records.territories],
    loaded: true,
    filter: { kind: 'all' },
  })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  seedStores()
  useAssistantStore.setState({ tool: 'compare-caches', summaryScope: { kind: 'all' } })
  fetchWindField.mockResolvedValue(makeWindField(POINTS, () => ({ speedKmh: 14 })))
  fetchForecast.mockResolvedValue(makeWeather(() => ({})))
  fetchVegetationGrid.mockResolvedValue(
    POINTS.map((coordinate) => ({
      coordinate,
      radiusMeters: 500,
      categoryCounts: { forest: 2, water: 1 },
      source: 'openstreetmap' as const,
    })),
  )
  await useHeatmapStore.getState().compute(BOUNDS, () => 300)
  useHeatmapStore.setState({ enabled: true, selectedCellIndex: null })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  useHeatmapStore.setState({
    status: 'idle',
    enabled: false,
    cells: [],
    statics: [],
    hourOptions: [],
    hour: null,
    selectedCellIndex: null,
    lastSelectedCellIndex: null,
    previousCellIndex: null,
  })
  useWaypointsStore.setState({ waypoints: [], loaded: false })
  useTracksStore.setState({ tracks: [], loaded: false })
  useJournalStore.setState({ observations: [], loaded: false })
  useTerritoriesStore.setState({ territories: [], loaded: false })
})

describe('intégration : « Expliquer » et « Résumer »', () => {
  it('« Expliquer cette cellule » ouvre /assistant sur l’outil Expliquer', async () => {
    const user = userEvent.setup()
    useHeatmapStore.getState().selectCell(10)
    render(
      <MemoryRouter initialEntries={['/carte']}>
        <Where />
        <Routes>
          <Route path="/carte" element={<HeatmapCellSheet />} />
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(screen.getByTestId('explain-cell'))
    expect(screen.getByTestId('where')).toHaveTextContent('/assistant')
    expect(useAssistantStore.getState().tool).toBe('explain')
    const result = await screen.findByTestId('assistant-result')
    expect(within(result).getByTestId('origin-badge')).toHaveTextContent(
      'Calcul / résumé automatique',
    )
    expect(result.querySelector('[data-nature="interprétation IA"]')).toBeNull()
    expect(result.querySelectorAll('[data-nature]').length).toBeGreaterThan(0)
  })

  it('« Résumer {territoire} » ouvre le résumé de ce territoire seulement', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/territoires']}>
        <Where />
        <Routes>
          <Route path="/territoires" element={<TerritoryManager />} />
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const [first] = sampleRecords().territories
    await user.click(screen.getByRole('button', { name: `Résumer ${first.name}` }))
    expect(screen.getByTestId('where')).toHaveTextContent('/assistant')
    expect(useAssistantStore.getState().tool).toBe('territory-summary')
    expect(useAssistantStore.getState().summaryScope).toEqual({
      kind: 'territory',
      id: first.id,
    })
    await waitFor(() =>
      expect(screen.getByTestId('assistant-result')).toBeInTheDocument(),
    )
  })
})

describe('navigation', () => {
  it('/assistant est une entrée secondaire : absente de la barre du bas', () => {
    const entry = navItems.find((item) => item.path === '/assistant')
    expect(entry).toBeDefined()
    expect(entry?.primary).not.toBe(true)
    expect(entry?.label).toBe('Assistant')
  })
})
