import { create } from 'zustand'
import type { Coordinate, SavedHuntAnalysis } from '@/types'
import { weatherProvider } from '@/services/weather'
import { landCoverProvider } from '@/services/landcover/OverpassLandCoverProvider'
import {
  getHuntAnalysis,
  listHuntAnalyses,
  putHuntAnalysis,
} from '@/database/huntAnalysesRepository'
import { addDays, zonedDateKey } from '@/features/hunting-hours/zonedTime'
import { createExtent, extentKey } from '../spatial'
import {
  DEFAULT_INPUTS,
  composeAnalysis,
  deviceTimeZone,
  type HuntInputs,
} from './compose'

export type HuntStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface HuntResult {
  record: SavedHuntAnalysis
  /** `live` : calculée maintenant ; `enregistree` : relue de l'appareil (hors ligne). */
  origin: 'live' | 'enregistree'
  notes: string[]
}

interface HuntState {
  inputs: HuntInputs
  status: HuntStatus
  result: HuntResult | null
  error: string | null
  saved: SavedHuntAnalysis[]
  /** Secteurs et points affichés sur la carte. */
  mapVisible: boolean
  sectorOpacity: number
  setInputs(patch: Partial<HuntInputs>): void
  resetAdvanced(): void
  setMapVisible(visible: boolean): void
  setSectorOpacity(opacity: number): void
  run(): Promise<void>
  cancel(): void
  loadSaved(id: string): Promise<void>
  refreshSaved(): Promise<void>
}

let controller: AbortController | null = null
/** Jeton du calcul courant : une réponse tardive d'un ancien calcul est ignorée. */
let token = 0

export const useHuntStore = create<HuntState>((set, get) => ({
  inputs: DEFAULT_INPUTS,
  status: 'idle',
  result: null,
  error: null,
  saved: [],
  mapVisible: true,
  sectorOpacity: 0.45,

  setInputs(patch) {
    set((s) => ({ inputs: { ...s.inputs, ...patch } }))
  },
  resetAdvanced() {
    set((s) => ({
      inputs: {
        ...s.inputs,
        favorableWindFrom: DEFAULT_INPUTS.favorableWindFrom,
        sensitiveBearings: DEFAULT_INPUTS.sensitiveBearings,
        availability: DEFAULT_INPUTS.availability,
        huntingRuleId: DEFAULT_INPUTS.huntingRuleId,
        experimentalSolunar: DEFAULT_INPUTS.experimentalSolunar,
        maxCandidates: DEFAULT_INPUTS.maxCandidates,
        radiusM: DEFAULT_INPUTS.radiusM,
      },
    }))
  },
  setMapVisible(visible) {
    set({ mapVisible: visible })
  },
  setSectorOpacity(opacity) {
    set({ sectorOpacity: Math.min(0.9, Math.max(0.1, opacity)) })
  },

  cancel() {
    token++
    controller?.abort()
    controller = null
    if (get().status === 'loading') set({ status: get().result ? 'ready' : 'idle' })
  },

  async refreshSaved() {
    try {
      set({ saved: await listHuntAnalyses() })
    } catch {
      set({ saved: [] })
    }
  },

  async loadSaved(id) {
    const record = await getHuntAnalysis(id)
    if (!record) return
    token++
    controller?.abort()
    set({
      status: 'ready',
      error: null,
      result: {
        record,
        origin: 'enregistree',
        notes: [
          `Analyse enregistrée le ${record.savedAt.slice(0, 16).replace('T', ' ')} (UTC), relue sans réseau.`,
        ],
      },
    })
  },

  async run() {
    const { inputs } = get()
    if (!inputs.coordinate) {
      set({ status: 'error', error: 'Choisissez d’abord un point GPS.' })
      return
    }
    controller?.abort()
    const mine = ++token
    const ctl = new AbortController()
    controller = ctl
    set({ status: 'loading', error: null })

    const coordinate: Coordinate = inputs.coordinate
    const extent = createExtent(coordinate, inputs.radiusM)
    const tzGuess = deviceTimeZone()
    const now = new Date()
    // Nombre de jours de prévision à demander pour couvrir la période (≤ 16).
    const startKey = inputs.startDateKey ?? zonedDateKey(now, tzGuess)
    let offset = 0
    for (let k = zonedDateKey(now, tzGuess); k < startKey && offset < 16; offset++) {
      k = addDays(k, 1)
    }
    const forecastDays = Math.min(16, offset + inputs.days + 1)

    const [forecastRes, landRes] = await Promise.allSettled([
      weatherProvider.fetchPointForecast(coordinate, forecastDays, ctl.signal),
      landCoverProvider.fetchLandCover(extent, ctl.signal),
    ])
    // Résultat périmé (nouveau calcul ou annulation) : ignoré.
    if (mine !== token) return

    const forecast = forecastRes.status === 'fulfilled' ? forecastRes.value : null
    const land = landRes.status === 'fulfilled' ? landRes.value : null
    const notes: string[] = []

    if (!forecast && !land) {
      // Tout a échoué (probablement hors ligne) : relire la dernière analyse du même endroit.
      const key = extentKey(extent)
      const previous = (await listHuntAnalyses().catch(() => [])).find(
        (r) => r.extentKey === key,
      )
      if (mine !== token) return
      if (previous) {
        set({
          status: 'ready',
          error: null,
          result: {
            record: previous,
            origin: 'enregistree',
            notes: [
              'Réseau indisponible : dernière analyse enregistrée pour cet endroit, relue sans réseau.',
            ],
          },
        })
        return
      }
      // Aucune donnée réseau : l'activité de référence (astronomie) reste calculable.
      notes.push(
        'Réseau indisponible : seule l’activité de référence (astronomie) est calculée.',
      )
    } else {
      if (!forecast)
        notes.push(
          'Prévision météo indisponible : indice limité à l’activité de référence.',
        )
      if (!land)
        notes.push('Occupation du sol indisponible : aucun secteur ni point candidat.')
    }

    try {
      const { record, timezoneNote } = composeAnalysis(inputs, forecast, land, {
        now,
        forecastFetchedAt: forecast ? now.toISOString() : null,
        fallbackTimeZone: tzGuess,
      })
      if (timezoneNote) notes.push(timezoneNote)
      set({ status: 'ready', error: null, result: { record, origin: 'live', notes } })
      if (forecast || land) {
        try {
          await putHuntAnalysis(record)
          if (mine === token) await get().refreshSaved()
        } catch {
          if (mine === token)
            set((s) =>
              s.result
                ? {
                    result: {
                      ...s.result,
                      notes: [
                        ...s.result.notes,
                        'Enregistrement hors ligne impossible (stockage).',
                      ],
                    },
                  }
                : s,
            )
        }
      }
    } catch (e) {
      if (mine === token)
        set({
          status: 'error',
          error: e instanceof Error ? e.message : 'Calcul impossible.',
        })
    }
  },
}))
