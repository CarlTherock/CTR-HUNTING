import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { createObservation } from '@/database/observationsRepository'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { buildGrid } from '@/utils/grid'
import { NOW, makeWeather, makeWindField } from '../testFixtures'
import { useHeatmapStore } from './heatmapStore'

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
const queryElevation = () => 300

function vegetation() {
  return POINTS.map((coordinate) => ({
    coordinate,
    radiusMeters: 500,
    categoryCounts: { forest: 1 },
    source: 'openstreetmap' as const,
  }))
}

function mockAllSources() {
  fetchWindField.mockResolvedValue(
    makeWindField(POINTS, (time) =>
      time === '2026-08-17T18:00' ? { speedKmh: 40 } : { speedKmh: 14 },
    ),
  )
  fetchForecast.mockResolvedValue(
    makeWeather((time) => (time === '2026-08-17T18:00' ? { precipitationMm: 7 } : {})),
  )
  fetchVegetationGrid.mockResolvedValue(vegetation())
}

function resetStore() {
  useHeatmapStore.setState({
    status: 'idle',
    enabled: false,
    cells: [],
    errorReason: null,
    selectedView: 'combined',
    computedBounds: null,
    unavailableSources: [],
    statics: [],
    windField: null,
    weather: null,
    computedAt: null,
    selectedHourKey: null,
    hour: null,
    hourOptions: [],
    selectedCellIndex: null,
    lastSelectedCellIndex: null,
    previousCellIndex: null,
    compareHourKey: null,
  })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetStore()
  await db.observations.clear()
  useWaypointsStore.setState({ waypoints: [], loaded: true, draft: null })
  useTracksStore.setState({ tracks: [], loaded: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  fetchWindField.mockReset()
  fetchForecast.mockReset()
  fetchVegetationGrid.mockReset()
})

describe('heatmapStore : heure sélectionnée', () => {
  it('ne fait que 3 requêtes au calcul, puis AUCUNE quand on change d’heure', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    expect(fetchWindField).toHaveBeenCalledTimes(1)
    expect(fetchForecast).toHaveBeenCalledTimes(1)
    expect(fetchVegetationGrid).toHaveBeenCalledTimes(1)

    useHeatmapStore.getState().setSelectedHour('2026-08-17T18:00')
    useHeatmapStore.getState().setSelectedHour('2026-08-18T06:00')
    useHeatmapStore.getState().setSelectedHour(null)

    expect(fetchWindField).toHaveBeenCalledTimes(1)
    expect(fetchForecast).toHaveBeenCalledTimes(1)
    expect(fetchVegetationGrid).toHaveBeenCalledTimes(1)
  })

  it('recalcule les cellules à l’heure choisie et étiquette les facteurs', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    const factorLabel = (analyzer: 'wind' | 'weather') =>
      useHeatmapStore
        .getState()
        .cells[0].combined.results.find((r) => r.analyzer === analyzer)?.factors[0]

    expect(useHeatmapStore.getState().hour?.kind).toBe('current')
    expect(factorLabel('wind')?.timeLabel).toBe('actuel')
    expect(factorLabel('wind')?.label).toBe('Vent soutenu')

    useHeatmapStore.getState().setSelectedHour('2026-08-17T18:00')
    expect(useHeatmapStore.getState().hour?.kind).toBe('forecast')
    expect(factorLabel('wind')?.timeLabel).toBe('prévision pour 18:00')
    expect(factorLabel('wind')?.label).toBe('Vent fort')
    expect(useHeatmapStore.getState().cells).toHaveLength(64)
  })

  it('n’offre que les heures réellement chargées (48 h + l’heure en cours), jamais d’extrapolation', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    const keys = useHeatmapStore.getState().hourOptions.map((o) => o.hourKey)
    expect(keys).toHaveLength(48)
    expect(keys).not.toContain('2026-08-19T00:00')
  })

  it('une heure choisie qui n’existe pas dans les nouvelles données retombe sur « actuel »', async () => {
    mockAllSources()
    useHeatmapStore.setState({ selectedHourKey: '2026-09-30T06:00' })
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    expect(useHeatmapStore.getState().selectedHourKey).toBeNull()
    expect(useHeatmapStore.getState().hour?.kind).toBe('current')
  })

  it('conserve l’heure choisie lors d’un recalcul si elle existe encore', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    useHeatmapStore.getState().setSelectedHour('2026-08-17T18:00')
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    expect(useHeatmapStore.getState().selectedHourKey).toBe('2026-08-17T18:00')
  })

  it('expose la résolution réelle des cellules (m), fonction de l’emprise', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    const size = useHeatmapStore.getState().cellSize
    // 0,2° de latitude ≈ 22,2 km → 8 rangées ≈ 2,8 km.
    expect(size?.heightMeters).toBeGreaterThan(2700)
    expect(size?.heightMeters).toBeLessThan(2850)
    expect(size?.widthMeters).toBeGreaterThan(1800)
    expect(size?.widthMeters).toBeLessThan(2100)
  })
})

describe('heatmapStore : calcul périmé', () => {
  it('ignore un calcul ancien qui se termine après un calcul plus récent', async () => {
    let releaseOld: (value: unknown) => void = () => undefined
    fetchWindField.mockImplementationOnce(
      () => new Promise((resolve) => (releaseOld = resolve)),
    )
    fetchForecast.mockResolvedValueOnce(makeWeather())
    fetchVegetationGrid.mockResolvedValueOnce(vegetation())
    const oldBounds = { west: -72, south: 45, east: -71.8, north: 45.2 }
    const oldRun = useHeatmapStore.getState().compute(oldBounds, queryElevation)

    // L’utilisateur déplace la carte et relance : ce calcul-ci est le bon.
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    expect(useHeatmapStore.getState().computedBounds).toEqual(BOUNDS)

    // Le vieux calcul se termine enfin : il ne doit RIEN écrire.
    releaseOld(makeWindField(buildGrid(oldBounds, 8)))
    await oldRun
    expect(useHeatmapStore.getState().computedBounds).toEqual(BOUNDS)
    expect(useHeatmapStore.getState().status).toBe('ready')
  })

  it('un calcul ancien en erreur n’écrase pas non plus le calcul récent', async () => {
    let rejectOld: (reason: Error) => void = () => undefined
    fetchWindField.mockImplementationOnce(
      () => new Promise((_, reject) => (rejectOld = reject)),
    )
    fetchForecast.mockRejectedValueOnce(new Error('x'))
    fetchVegetationGrid.mockRejectedValueOnce(new Error('x'))
    const oldRun = useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    rejectOld(new Error('tard'))
    await oldRun
    expect(useHeatmapStore.getState().status).toBe('ready')
    expect(useHeatmapStore.getState().errorReason).toBeNull()
  })
})

describe('heatmapStore : sélection d’une cellule', () => {
  it('toucher la carte sélectionne la cellule qui contient le point ; hors zone, la désélectionne', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    const { selectCellAt } = useHeatmapStore.getState()

    selectCellAt(POINTS[10]) // centre de la cellule 10
    expect(useHeatmapStore.getState().selectedCellIndex).toBe(10)

    selectCellAt({ lat: 50, lng: -60 })
    expect(useHeatmapStore.getState().selectedCellIndex).toBeNull()
  })

  it('retient la cellule précédente pour « pourquoi elles diffèrent »', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    const { selectCell } = useHeatmapStore.getState()
    selectCell(3)
    expect(useHeatmapStore.getState().previousCellIndex).toBeNull()
    selectCell(20)
    expect(useHeatmapStore.getState().previousCellIndex).toBe(3)
    selectCell(null)
    selectCell(40)
    expect(useHeatmapStore.getState().previousCellIndex).toBe(20)
  })

  it('un nouveau calcul de zone efface la sélection', async () => {
    mockAllSources()
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    useHeatmapStore.getState().selectCell(5)
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    expect(useHeatmapStore.getState().selectedCellIndex).toBeNull()
  })
})

describe('heatmapStore : Observations réelles', () => {
  it('lit le journal local : une entrée dans la cellule apparaît en information, sans score', async () => {
    mockAllSources()
    await createObservation({ coordinate: POINTS[9], notes: 'Traces fraîches' })
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    const history = useHeatmapStore
      .getState()
      .cells[9].combined.results.find((r) => r.analyzer === 'history')
    expect(history?.factors.some((f) => f.label === 'Entrées de journal')).toBe(true)
    expect(history?.score).toBeNull()
  })

  it('un indice de gibier saisi dans la cellule devient un facteur compté de la famille Observations', async () => {
    mockAllSources()
    useWaypointsStore.setState({
      waypoints: [
        {
          id: 'w1',
          name: 'Frotti',
          coordinate: POINTS[9],
          category: 'game_sign',
          createdAt: '2026-08-01T00:00:00.000Z',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    })
    await useHeatmapStore.getState().compute(BOUNDS, queryElevation)
    const families = useHeatmapStore.getState().cells[9].combined.families ?? []
    expect(families.find((f) => f.family === 'observations')?.score).toBeGreaterThan(50)
    // Les cellules voisines, sans enregistrement, restent « sans donnée ».
    const neighbour = useHeatmapStore.getState().cells[10].combined.families ?? []
    expect(neighbour.find((f) => f.family === 'observations')?.score).toBeNull()
  })
})
