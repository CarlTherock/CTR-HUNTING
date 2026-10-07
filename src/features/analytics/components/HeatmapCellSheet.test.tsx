import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import { WaypointLockedError } from '@/database/waypointsRepository'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { buildGrid } from '@/utils/grid'
import { NOW, makeWeather, makeWindField } from '../testFixtures'
import { useHeatmapStore } from '../state/heatmapStore'
import { HeatmapCellSheet } from './HeatmapCellSheet'

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

async function loadHeatmap() {
  fetchWindField.mockResolvedValue(
    makeWindField(POINTS, (time) =>
      time === '2026-08-17T18:00' ? { speedKmh: 40 } : { speedKmh: 14 },
    ),
  )
  fetchForecast.mockResolvedValue(
    makeWeather((time) => (time === '2026-08-17T18:00' ? { precipitationMm: 7 } : {})),
  )
  fetchVegetationGrid.mockResolvedValue(
    POINTS.map((coordinate, i) => ({
      coordinate,
      radiusMeters: 500,
      // La cellule 5 est « aménagée », les autres forestières.
      categoryCounts: i === 5 ? { developed: 2 } : { forest: 2, water: 1 },
      source: 'openstreetmap' as const,
    })),
  )
  await useHeatmapStore.getState().compute(BOUNDS, () => 300)
  useHeatmapStore.setState({ enabled: true })
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useHeatmapStore.setState({
    status: 'idle',
    enabled: false,
    cells: [],
    statics: [],
    hourOptions: [],
    hour: null,
    selectedHourKey: null,
    selectedCellIndex: null,
    lastSelectedCellIndex: null,
    previousCellIndex: null,
    compareHourKey: null,
  })
  await db.waypoints.clear()
  await db.observations.clear()
  useWaypointsStore.setState({
    waypoints: [],
    loaded: true,
    draft: null,
    isPlacing: false,
  })
  useTracksStore.setState({ tracks: [], loaded: true })
  await loadHeatmap()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('HeatmapCellSheet', () => {
  it('ne rend rien tant qu’aucune cellule n’est sélectionnée', () => {
    render(<HeatmapCellSheet />)
    expect(screen.queryByTestId('heatmap-cell-sheet')).toBeNull()
  })

  it('présente les trois familles séparées, la couverture et la mise en garde « pas une probabilité »', () => {
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    const sheet = within(screen.getByTestId('heatmap-cell-sheet'))

    for (const name of [
      'Famille Habitat',
      'Famille Conditions',
      'Famille Observations',
    ]) {
      expect(sheet.getByRole('region', { name })).toBeInTheDocument()
    }
    expect(sheet.getByTestId('coverage-line')).toHaveTextContent(
      '5 groupes de facteurs sur 6 renseignés',
    )
    expect(sheet.getByTestId('coverage-line')).toHaveTextContent('manque : Historique')
    expect(sheet.getByText(/pas une probabilité de présence/)).toBeInTheDocument()
    expect(sheet.getByText(/aucun profil d’espèce/)).toBeInTheDocument()
    // Pas de pourcentage de confiance arbitraire.
    expect(sheet.queryByText(/confiance/i)).toBeNull()
    expect(sheet.queryByText(/% de/)).toBeNull()
  })

  it('affiche la résolution réelle de la cellule', () => {
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    expect(screen.getByText(/≈ 2,0 km × 2,8 km|≈ 1,9 km × 2,8 km/)).toBeInTheDocument()
  })

  it('une famille sans donnée dit « aucun indice » au lieu d’un score neutre', () => {
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    const observations = within(
      screen.getByRole('region', { name: 'Famille Observations' }),
    )
    expect(observations.getByText(/aucun indice/)).toBeInTheDocument()
  })

  it('déplier la Météo montre « actuel », « identique sur toute la zone », la source et la limite', async () => {
    const user = userEvent.setup()
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    const conditions = within(screen.getByRole('region', { name: 'Famille Conditions' }))

    await user.click(conditions.getByRole('button', { name: /Météo/ }))

    expect(conditions.getAllByText('actuel').length).toBeGreaterThan(0)
    expect(conditions.getAllByText('identique sur toute la zone').length).toBeGreaterThan(
      0,
    )
    expect(conditions.getByText('Open-Meteo (modèle)')).toBeInTheDocument()
    expect(
      conditions.getByText(/Une seule requête météo, au centre de la zone/),
    ).toBeInTheDocument()
  })

  it('changer l’heure depuis la fiche étiquette les facteurs « prévision pour 18:00 » sans requête', async () => {
    const user = userEvent.setup()
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    fetchWindField.mockClear()
    fetchForecast.mockClear()
    fetchVegetationGrid.mockClear()

    await user.selectOptions(screen.getByLabelText('Heure analysée'), '2026-08-17T18:00')

    expect(screen.getByText('prévision pour 18:00')).toBeInTheDocument()
    expect(fetchWindField).not.toHaveBeenCalled()
    expect(fetchForecast).not.toHaveBeenCalled()
    expect(fetchVegetationGrid).not.toHaveBeenCalled()
    const conditions = within(screen.getByRole('region', { name: 'Famille Conditions' }))
    await user.click(conditions.getByRole('button', { name: /Vent/ }))
    expect(conditions.getAllByText('prévision pour 18:00').length).toBeGreaterThan(0)
  })

  it('compare maintenant et un autre créneau disponible, sans requête', async () => {
    const user = userEvent.setup()
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    fetchWindField.mockClear()
    fetchForecast.mockClear()

    await user.selectOptions(
      screen.getByLabelText('Créneau à comparer'),
      '2026-08-17T18:00',
    )

    const section = within(screen.getByRole('region', { name: 'Comparer deux créneaux' }))
    expect(section.getByText(/Facteurs qui expliquent l’écart/)).toBeInTheDocument()
    expect(section.getByText(/Fortes précipitations/)).toBeInTheDocument()
    expect(fetchWindField).not.toHaveBeenCalled()
    expect(fetchForecast).not.toHaveBeenCalled()
  })

  it('n’offre pas « actuel » comme créneau de comparaison (on compare à maintenant)', () => {
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    const select = screen.getByLabelText('Créneau à comparer')
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(labels.some((l) => l?.startsWith('Actuel'))).toBe(false)
    expect(labels.length).toBeGreaterThan(5)
  })

  it('explique pourquoi deux cellules diffèrent par leurs facteurs d’habitat, pas par la météo commune', async () => {
    useHeatmapStore.getState().selectCell(10) // forêt + eau
    useHeatmapStore.getState().selectCell(5) // aménagée
    render(<HeatmapCellSheet />)
    const panel = within(
      screen.getByRole('region', { name: 'Pourquoi cette cellule diffère' }),
    )
    expect(panel.getByText(/Terrain aménagé à proximité/)).toBeInTheDocument()
    expect(
      panel.getByText(/Identiques parce qu’ils valent pour toute la zone/),
    ).toBeInTheDocument()
  })

  it('« Enregistrer cette cellule comme waypoint » ouvre le brouillon existant, sans rien écrire ni contourner le verrouillage', async () => {
    const user = userEvent.setup()
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)

    await user.click(
      screen.getByRole('button', { name: 'Enregistrer cette cellule comme waypoint' }),
    )

    const { draft, waypoints } = useWaypointsStore.getState()
    expect(draft?.coordinate).toEqual(POINTS[10])
    expect(draft?.initialName).toBe('Cellule d’analyse')
    expect(waypoints).toEqual([]) // rien n’est écrit avant « Enregistrer »
    expect(await db.waypoints.count()).toBe(0)
    expect(useHeatmapStore.getState().selectedCellIndex).toBeNull()

    // Parcours existant : Save persiste et verrouille la position.
    expect(
      await useWaypointsStore.getState().saveDraft({
        name: 'Cellule d’analyse',
        category: 'general',
        color: '#f59e0b',
        notes: '',
        optimalWindDirections: [],
      }),
    ).toBe(true)
    const [saved] = useWaypointsStore.getState().waypoints
    expect(saved.coordinate).toEqual(POINTS[10])
    await expect(
      useWaypointsStore.getState().updateWaypoint(saved.id, {
        coordinate: { lat: 0, lng: 0 },
      } as never),
    ).rejects.toBeInstanceOf(WaypointLockedError)
  })

  it('ferme la fiche avec le bouton dédié', async () => {
    const user = userEvent.setup()
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    await user.click(
      screen.getByRole('button', { name: 'Fermer la fiche de la cellule' }),
    )
    expect(useHeatmapStore.getState().selectedCellIndex).toBeNull()
  })

  it('mentionne qu’aucun « animal observé » structuré n’existe et que les visites ne comptent pas', () => {
    useHeatmapStore.getState().selectCell(10)
    render(<HeatmapCellSheet />)
    expect(
      screen.getByText(/Aucune donnée structurée « animal observé »/),
    ).toBeInTheDocument()
    expect(screen.getByText(/n’augmente pas\s+l’indice d’habitat/)).toBeInTheDocument()
  })
})
