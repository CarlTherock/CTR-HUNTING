import { create } from 'zustand'
import { listObservations } from '@/database/observationsRepository'
import { vegetationProvider } from '@/services/vegetation'
import { weatherProvider } from '@/services/weather'
import { windProvider } from '@/services/wind'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { buildHourOptions, dataTimeZone, resolveHour } from '@/utils/analysisTime'
import { buildGrid, cellBoundsAt, cellIndexAt, cellSizeMeters } from '@/utils/grid'
import { computeTemporalData } from '@/utils/temporal'
import { analyzeCellAtHour, computeCellStatics } from '../heatmapEngine'
import type { CellStatic } from '../heatmapEngine'
import type { HourOption, HourSelection } from '@/utils/analysisTime'
import type { CellSizeMeters } from '@/utils/grid'
import type {
  AnalysisHeatmapCell,
  AnalyzerId,
  AnalysisFamily,
  Coordinate,
  Observation,
  WeatherForecast,
  WindField,
} from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export type HeatmapStatus = 'idle' | 'loading' | 'ready' | 'error'
/** Ce qui colore la carte : l'indice combiné, une famille (Habitat /
 * Conditions / Observations) ou un seul analyseur. Changer de vue est une
 * simple re-projection des cellules déjà calculées (voir
 * `heatmapProjection.ts`) — jamais une requête. */
export type HeatmapView = 'combined' | AnalysisFamily | AnalyzerId

/** 8×8 = 64 cellules réelles. La grille alimente 3 requêtes groupées au
 * total (un lot de vent, un point météo, une requête de végétation sur
 * l'emprise) — jamais une requête par cellule. Une grille adaptative a été
 * évaluée puis écartée : le vent (maille du modèle), la météo (1 point) et
 * la végétation OSM (polygones attribués à leur centre) ne gagnent rien à
 * des cellules plus fines ; la résolution réelle est plutôt AFFICHÉE
 * (`cellSize`) pour que personne ne lise plus de précision qu'il n'y en a. */
export const GRID_SIZE = 8

interface HeatmapState {
  status: HeatmapStatus
  enabled: boolean
  /** Cellules pour l'heure choisie. */
  cells: AnalysisHeatmapCell[]
  errorReason: string | null
  selectedView: HeatmapView
  /** Area the current cells were computed for — lets the UI offer a
   * recompute once the user pans somewhere else. */
  computedBounds: LngLatBounds | null
  /** Real sources that failed on the last compute (e.g. Overpass busy) —
   * their analyzer is shown as unavailable, never guessed. */
  unavailableSources: string[]

  // --- Données chargées (source du recalcul par heure, sans requête) ---
  gridSize: number
  cellSize: CellSizeMeters | null
  statics: CellStatic[]
  windField: WindField | null
  weather: WeatherForecast | null
  /** ISO : quand les 3 requêtes ont été faites. */
  computedAt: string | null

  // --- Heure ---
  /** Heure locale choisie (`YYYY-MM-DDTHH:00`) ; `null` = l'heure en cours. */
  selectedHourKey: string | null
  hour: HourSelection | null
  hourOptions: HourOption[]

  // --- Fiche de cellule ---
  selectedCellIndex: number | null
  lastSelectedCellIndex: number | null
  previousCellIndex: number | null
  /** Créneau comparé à l'heure choisie dans la fiche (`null` = aucun). */
  compareHourKey: string | null

  toggle: (
    bounds: LngLatBounds,
    queryElevation: (coordinate: Coordinate) => number | null,
  ) => void
  compute: (
    bounds: LngLatBounds,
    queryElevation: (coordinate: Coordinate) => number | null,
  ) => Promise<void>
  setSelectedView: (view: HeatmapView) => void
  /** Change l'heure analysée : recalcul PUR sur les données chargées. */
  setSelectedHour: (hourKey: string | null) => void
  selectCell: (index: number | null) => void
  selectCellAt: (coordinate: Coordinate) => void
  setCompareHour: (hourKey: string | null) => void
}

/** Jeton de génération : un calcul plus ancien qui se termine après un
 * calcul plus récent est ignoré (jamais écrit dans le store). */
let generation = 0

async function readObservations(): Promise<Observation[]> {
  try {
    return await listObservations()
  } catch {
    return []
  }
}

function hourFor(
  requestedKey: string | null,
  windField: WindField | null,
  weather: WeatherForecast | null,
  now: Date,
) {
  const hourOptions = buildHourOptions(windField, weather, now)
  // Une heure demandée qui n'existe plus dans les données retombe sur « actuel ».
  const key =
    requestedKey && hourOptions.some((o) => o.hourKey === requestedKey)
      ? requestedKey
      : null
  const hour = resolveHour(key, now, dataTimeZone(windField, weather))
  return { hourOptions, hour, selectedHourKey: key }
}

/** Recalcule les 64 cellules pour `hour` à partir des données déjà
 * chargées. Pur (aucune requête). */
function cellsForHour(
  statics: CellStatic[],
  hour: HourSelection,
  windField: WindField | null,
  weather: WeatherForecast | null,
  bounds: LngLatBounds,
  gridSize: number,
): AnalysisHeatmapCell[] {
  const center: Coordinate = {
    lat: (bounds.north + bounds.south) / 2,
    lng: (bounds.east + bounds.west) / 2,
  }
  const size = cellSizeMeters(bounds, gridSize)
  const temporal = computeTemporalData(hour.solarReference, center)
  return statics.map((s) =>
    analyzeCellAtHour(
      s,
      hour,
      { windField, weather },
      {
        sampleSpacingMeters: (size.widthMeters + size.heightMeters) / 2,
        weatherScope: 'zone-center',
        temporal,
      },
    ),
  )
}

export const useHeatmapStore = create<HeatmapState>((set, get) => ({
  status: 'idle',
  enabled: false,
  cells: [],
  errorReason: null,
  selectedView: 'combined',
  computedBounds: null,
  unavailableSources: [],

  gridSize: GRID_SIZE,
  cellSize: null,
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

  toggle: (bounds, queryElevation) => {
    const { enabled, cells } = get()
    if (enabled) {
      set({ enabled: false })
      return
    }
    set({ enabled: true })
    if (cells.length === 0) void get().compute(bounds, queryElevation)
  },

  compute: async (bounds, queryElevation) => {
    const token = ++generation
    set({ status: 'loading', errorReason: null })
    try {
      const center: Coordinate = {
        lat: (bounds.north + bounds.south) / 2,
        lng: (bounds.east + bounds.west) / 2,
      }
      // allSettled, not all: one busy provider (the public Overpass
      // instance regularly answers 429/504) must not blank the whole
      // heatmap — that analyzer just becomes unavailable.
      const [windResult, weatherResult, vegetationResult] = await Promise.allSettled([
        windProvider.fetchWindField(bounds, GRID_SIZE),
        weatherProvider.fetchForecast(center),
        vegetationProvider.fetchVegetationGrid(bounds, GRID_SIZE),
      ])
      // Calcul périmé (l'utilisateur en a relancé un depuis) : on jette.
      if (token !== generation) return
      const windField = windResult.status === 'fulfilled' ? windResult.value : null
      const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null
      const vegetationSamples =
        vegetationResult.status === 'fulfilled' ? vegetationResult.value : []
      const unavailableSources = [
        windResult.status === 'rejected' ? 'Vent' : null,
        weatherResult.status === 'rejected' ? 'Météo' : null,
        vegetationResult.status === 'rejected' ? 'Végétation' : null,
      ].filter((s): s is string => s !== null)
      if (unavailableSources.length === 3) {
        throw new Error('aucune source de données ne répond (hors ligne ?)')
      }

      // Lecture locale (Dexie), pas une requête réseau.
      const observations = await readObservations()
      if (token !== generation) return

      const points = buildGrid(bounds, GRID_SIZE)
      const { waypoints } = useWaypointsStore.getState()
      const { tracks } = useTracksStore.getState()
      const now = new Date()
      const size = cellSizeMeters(bounds, GRID_SIZE)
      const fetchedAt = now.toISOString()

      const statics = points.map((coordinate, i) =>
        computeCellStatics(
          coordinate,
          queryElevation,
          vegetationSamples[i] ?? null,
          waypoints,
          tracks,
          {
            cellBounds: cellBoundsAt(bounds, GRID_SIZE, i),
            cellScopeMeters: Math.max(size.widthMeters, size.heightMeters),
            observations,
            fetchedAt,
          },
        ),
      )
      const { hourOptions, hour, selectedHourKey } = hourFor(
        get().selectedHourKey,
        windField,
        weather,
        now,
      )
      const cells = cellsForHour(statics, hour, windField, weather, bounds, GRID_SIZE)
      set({
        status: 'ready',
        cells,
        statics,
        windField,
        weather,
        computedBounds: bounds,
        gridSize: GRID_SIZE,
        cellSize: size,
        computedAt: fetchedAt,
        unavailableSources,
        hour,
        hourOptions,
        selectedHourKey,
        // Une nouvelle zone : l'ancienne sélection n'a plus de sens.
        selectedCellIndex: null,
        lastSelectedCellIndex: null,
        previousCellIndex: null,
        compareHourKey: null,
      })
    } catch (err) {
      if (token !== generation) return
      set({
        status: 'error',
        errorReason: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    }
  },

  setSelectedView: (view) => set({ selectedView: view }),

  setSelectedHour: (hourKey) => {
    const { statics, windField, weather, computedBounds, gridSize } = get()
    if (statics.length === 0 || !computedBounds) {
      set({ selectedHourKey: hourKey })
      return
    }
    const { hourOptions, hour, selectedHourKey } = hourFor(
      hourKey,
      windField,
      weather,
      new Date(),
    )
    set((state) => ({
      selectedHourKey,
      hour,
      hourOptions,
      cells: cellsForHour(statics, hour, windField, weather, computedBounds, gridSize),
      compareHourKey: state.compareHourKey === hour.hourKey ? null : state.compareHourKey,
    }))
  },

  selectCell: (index) => {
    if (index === null) {
      set({ selectedCellIndex: null, compareHourKey: null })
      return
    }
    const { lastSelectedCellIndex, previousCellIndex } = get()
    set({
      selectedCellIndex: index,
      lastSelectedCellIndex: index,
      previousCellIndex:
        lastSelectedCellIndex !== null && lastSelectedCellIndex !== index
          ? lastSelectedCellIndex
          : previousCellIndex,
      compareHourKey: null,
    })
  },

  selectCellAt: (coordinate) => {
    const { computedBounds, gridSize, cells } = get()
    if (!computedBounds || cells.length === 0) return
    get().selectCell(cellIndexAt(computedBounds, gridSize, coordinate))
  },

  setCompareHour: (hourKey) => set({ compareHourKey: hourKey }),
}))
