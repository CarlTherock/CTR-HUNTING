import { create } from 'zustand'
import {
  deleteSavedForecast,
  listSavedForecasts,
  putSavedForecast,
} from '@/database/savedForecastsRepository'
import { weatherProvider } from '@/services/weather'
import { windProvider } from '@/services/wind'
import { haversineMeters } from '@/utils/geo'
import type { PointForecast, SavedForecast, SavedForecastPlace, WindField } from '@/types'
import {
  MAX_SAVED_FORECASTS,
  MISSING_LABEL,
  WIND_GRID_SIZE,
  buildSavedForecast,
  freeStorageBytes,
  shouldReplace,
  windZoneBounds,
  wouldNotFit,
} from './savedForecastLogic'

/** A new download for a place this close to a saved one updates that record. */
const UPDATE_SAME_PLACE_METERS = 200

export type DownloadOutcome =
  | { kind: 'complete'; saved: SavedForecast }
  | { kind: 'partial'; saved: SavedForecast; message: string }
  | { kind: 'kept-previous'; message: string }
  | { kind: 'failed'; message: string }

interface SavedForecastsState {
  items: SavedForecast[]
  loaded: boolean
  busy: boolean
  /** Result of the last download attempt, for the UI. */
  outcome: DownloadOutcome | null
  /** Set when the local database could not be read. */
  loadError: string | null

  load: () => Promise<void>
  download: (
    place: SavedForecastPlace,
    days: number,
    now?: Date,
  ) => Promise<DownloadOutcome>
  remove: (id: string) => Promise<void>
  clearOutcome: () => void
}

function reasonOf(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'espace de stockage insuffisant sur cet appareil'
  }
  return err instanceof Error ? err.message : 'erreur inconnue'
}

export const useSavedForecastsStore = create<SavedForecastsState>((set, get) => ({
  items: [],
  loaded: false,
  busy: false,
  outcome: null,
  loadError: null,

  load: async () => {
    try {
      const items = await listSavedForecasts()
      set({ items, loaded: true, loadError: null })
    } catch (err) {
      set({ loaded: true, loadError: reasonOf(err) })
    }
  },

  download: async (place, days, now = new Date()) => {
    if (get().busy) {
      return { kind: 'failed', message: 'Un téléchargement est déjà en cours.' }
    }
    const items = get().items
    const previous = items.find(
      (s) =>
        haversineMeters(s.place.coordinate, place.coordinate) <= UPDATE_SAME_PLACE_METERS,
    )
    if (!previous && items.length >= MAX_SAVED_FORECASTS) {
      const outcome: DownloadOutcome = {
        kind: 'failed',
        message: `Limite de ${MAX_SAVED_FORECASTS} téléchargements atteinte : supprimez-en un avant d’en ajouter un autre.`,
      }
      set({ outcome })
      return outcome
    }

    set({ busy: true, outcome: null })
    const bounds = windZoneBounds(place.coordinate)
    const [pointResult, windResult] = await Promise.allSettled([
      weatherProvider.fetchPointForecast(place.coordinate, days),
      windProvider.fetchWindField(bounds, WIND_GRID_SIZE, undefined, days),
    ])
    const point: PointForecast | null =
      pointResult.status === 'fulfilled' ? pointResult.value : null
    const windField: WindField | null =
      windResult.status === 'fulfilled' ? windResult.value : null

    let outcome: DownloadOutcome
    if (!point && !windField) {
      const why = reasonOf(
        pointResult.status === 'rejected'
          ? pointResult.reason
          : windResult.status === 'rejected'
            ? windResult.reason
            : null,
      )
      outcome = {
        kind: previous ? 'kept-previous' : 'failed',
        message: previous
          ? `Mise à jour impossible (${why}). Le téléchargement précédent est conservé.`
          : `Téléchargement impossible (${why}). Rien n’a été enregistré.`,
      }
    } else {
      const record = buildSavedForecast({
        id: previous?.id ?? crypto.randomUUID(),
        place,
        point,
        windField,
        windBounds: bounds,
        requestedDays: days,
        fetchedAt: now.toISOString(),
      })
      if (!shouldReplace(previous, record)) {
        outcome = {
          kind: 'kept-previous',
          message: `Mise à jour incomplète (manque : ${record.missing.map((m) => MISSING_LABEL[m]).join(' ; ')}). Le téléchargement précédent, complet, est conservé.`,
        }
      } else if (wouldNotFit(record.approxBytes, await freeStorageBytes())) {
        outcome = {
          kind: previous ? 'kept-previous' : 'failed',
          message:
            'Espace de stockage insuffisant sur cet appareil. Supprimez un téléchargement ou libérez de la place.',
        }
      } else {
        try {
          await putSavedForecast(record)
          const next = [record, ...get().items.filter((s) => s.id !== record.id)]
          set({ items: next })
          outcome =
            record.status === 'complete'
              ? { kind: 'complete', saved: record }
              : {
                  kind: 'partial',
                  saved: record,
                  message: `Téléchargement partiel : ${record.missing.map((m) => MISSING_LABEL[m]).join(' ; ')} manquant. Il n’est pas annoncé comme complet.`,
                }
        } catch (err) {
          outcome = {
            kind: previous ? 'kept-previous' : 'failed',
            message: `Enregistrement impossible (${reasonOf(err)}).${previous ? ' Le téléchargement précédent est conservé.' : ''}`,
          }
        }
      }
    }
    set({ busy: false, outcome })
    return outcome
  },

  remove: async (id) => {
    await deleteSavedForecast(id)
    set({ items: get().items.filter((s) => s.id !== id) })
  },

  clearOutcome: () => set({ outcome: null }),
}))
