import { create } from 'zustand'
import type { Coordinate, SavedHuntAnalysis } from '@/types'
import { weatherProvider } from '@/services/weather'
import { landCoverProvider } from '@/services/landcover/OverpassLandCoverProvider'
import { getHuntAnalysis, listHuntAnalyses, putHuntAnalysis } from '@/database/huntAnalysesRepository'
import { addDays, zonedDateKey } from '@/features/hunting-hours/zonedTime'
import { resolveTimeZone } from '@/features/rut/territory'
import { createExtent, extentKey } from '../spatial'
import { DEFAULT_INPUTS, composeAnalysis, deviceTimeZone, recordMatchesInputs, type HuntInputs } from './compose'
import { canReuseSavedAnalysis, canReuseSpatial } from './savedCompatibility'

export type HuntStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface HuntResult {
  record: SavedHuntAnalysis
  /** live : calculée maintenant ; enregistree : relue de l’appareil. */
  origin: 'live' | 'enregistree'
  notes: string[]
}

interface HuntState {
  inputs: HuntInputs
  status: HuntStatus
  result: HuntResult | null
  error: string | null
  saved: SavedHuntAnalysis[]
  mapVisible: boolean
  sectorOpacity: number
  picking: boolean
  pending: Coordinate | null
  picked: Coordinate | null
  selectedCandidateId: string | null
  focusToken: number
  startPicking(): void
  cancelPicking(): void
  pick(coordinate: Coordinate): void
  cancelPending(): void
  evaluatePending(period: { startDateKey: string; days: number }): void
  consumePicked(): void
  selectCandidate(id: string | null): void
  requestMapFocus(): void
  startFor(coordinate: Coordinate): void
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
let token = 0

export const useHuntStore = create<HuntState>((set, get) => ({
  inputs: DEFAULT_INPUTS,
  status: 'idle',
  result: null,
  error: null,
  saved: [],
  mapVisible: true,
  sectorOpacity: 0.45,
  picking: false,
  pending: null,
  picked: null,
  selectedCandidateId: null,
  focusToken: 0,

  startPicking() { set({ picking: true }) },
  cancelPicking() { set({ picking: false }) },
  pick(coordinate) { set({ picking: false, pending: coordinate }) },
  cancelPending() { set({ pending: null }) },
  evaluatePending({ startDateKey, days }) {
    const { pending } = get()
    if (!pending) return
    controller?.abort()
    token++
    set((s) => ({
      pending: null, picked: pending, status: 'idle', result: null, error: null,
      selectedCandidateId: null,
      inputs: { ...s.inputs, coordinate: pending, startDateKey, days },
    }))
  },
  consumePicked() { set({ picked: null }) },
  selectCandidate(id) { set({ selectedCandidateId: id }) },
  requestMapFocus() { set((s) => ({ focusToken: s.focusToken + 1, mapVisible: true })) },
  startFor(coordinate) {
    const key = `${coordinate.lat.toFixed(5)},${coordinate.lng.toFixed(5)}`
    const { inputs, status } = get()
    const same = inputs.coordinate && `${inputs.coordinate.lat.toFixed(5)},${inputs.coordinate.lng.toFixed(5)}` === key
    if (same && (status === 'loading' || status === 'ready')) return
    set((s) => ({ inputs: { ...s.inputs, coordinate }, selectedCandidateId: null }))
    void get().run()
  },
  setInputs(patch) { set((s) => ({ inputs: { ...s.inputs, ...patch } })) },
  resetAdvanced() {
    set((s) => ({ inputs: {
      ...s.inputs,
      favorableWindFrom: DEFAULT_INPUTS.favorableWindFrom,
      sensitiveBearings: DEFAULT_INPUTS.sensitiveBearings,
      availability: DEFAULT_INPUTS.availability,
      huntingRuleId: DEFAULT_INPUTS.huntingRuleId,
      experimentalSolunar: DEFAULT_INPUTS.experimentalSolunar,
      maxCandidates: DEFAULT_INPUTS.maxCandidates,
      radiusM: DEFAULT_INPUTS.radiusM,
    } }))
  },
  setMapVisible(visible) { set({ mapVisible: visible }) },
  setSectorOpacity(opacity) { set({ sectorOpacity: Math.min(0.9, Math.max(0.1, opacity)) }) },
  cancel() {
    token++
    controller?.abort()
    controller = null
    if (get().status === 'loading') set({ status: get().result ? 'ready' : 'idle' })
  },
  async refreshSaved() {
    const mine = token
    try {
      const saved = await listHuntAnalyses()
      if (mine === token) set({ saved })
    } catch {
      if (mine === token) set({ saved: [] })
    }
  },
  async loadSaved(id) {
    const mine = ++token
    controller?.abort()
    controller = null
    set({ status: 'loading', error: null })
    try {
      const record = await getHuntAnalysis(id)
      if (mine !== token) return
      if (!record) {
        set({ status: 'error', error: 'Analyse enregistrée introuvable.' })
        return
      }
      set({ status: 'ready', error: null, result: {
        record, origin: 'enregistree',
        notes: [`Analyse enregistrée le ${record.savedAt.slice(0, 16).replace('T', ' ')} (UTC), relue sans réseau.`],
      } })
    } catch (e) {
      if (mine === token) set({ status: 'error', error: e instanceof Error ? e.message : 'Lecture de l’analyse impossible.' })
    }
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
    const key = extentKey(extent)
    const zone = resolveTimeZone(coordinate.lat, coordinate.lng)
    const tzGuess = zone.timeZone ?? deviceTimeZone()
    const now = new Date()
    const startKey = inputs.startDateKey ?? zonedDateKey(now, tzGuess)
    let offset = 0
    for (let k = zonedDateKey(now, tzGuess); k < startKey && offset < 16; offset++) k = addDays(k, 1)
    const forecastDays = Math.min(16, offset + inputs.days + 1)
    const [forecastRes, landRes] = await Promise.allSettled([
      weatherProvider.fetchPointForecast(coordinate, forecastDays, ctl.signal),
      landCoverProvider.fetchLandCover(extent, ctl.signal),
    ])
    if (mine !== token) return
    const forecast = forecastRes.status === 'fulfilled' ? forecastRes.value : null
    const land = landRes.status === 'fulfilled' ? landRes.value : null
    const saved = land ? [] : await listHuntAnalyses().catch(() => [])
    // Une nouvelle analyse ou une annulation peut survenir pendant la lecture IndexedDB.
    if (mine !== token) return
    const reusedRecord = saved.find((r) => canReuseSpatial(r, inputs, key))
    const reused = reusedRecord?.spatial ? {
      spatial: reusedRecord.spatial,
      fetchedAt: reusedRecord.data.landCoverFetchedAt,
      source: reusedRecord.data.landCoverSource,
    } : null
    const notes: string[] = []
    if (!forecast && !land) {
      const previous = saved.find((r) => canReuseSavedAnalysis(r, inputs) && recordMatchesInputs(r, inputs, key, startKey))
      if (previous) {
        set({ status: 'ready', error: null, result: {
          record: previous, origin: 'enregistree',
          notes: ['Réseau indisponible : analyse enregistrée pour cet endroit, cette période et ces réglages, relue sans réseau.'],
        } })
        return
      }
      notes.push('Réseau indisponible : seule l’activité de référence (astronomie) est calculée.')
      if (saved.some((r) => r.extentKey === key)) notes.push('Les analyses enregistrées de ce lieu ne sont pas compatibles avec ce calcul ou ces réglages. Elles restent consultables dans les analyses enregistrées.')
    } else if (!forecast) {
      const why = forecastRes.status === 'rejected' && forecastRes.reason instanceof Error ? ` Cause : ${forecastRes.reason.message}` : ''
      notes.push(`Prévision météo indisponible : indice limité à l’activité de référence.${why}`)
    }
    if (!land) {
      const why = landRes.status === 'rejected' && landRes.reason instanceof Error ? ` Cause : ${landRes.reason.message}` : ''
      if (reused) notes.push(`Occupation du sol : service indisponible, secteurs et points relus de l’analyse du ${reused.fetchedAt?.slice(0, 10) ?? 'jour précédent'} pour ce même endroit (données enregistrées, pas une nouvelle lecture).${why}`)
      else notes.push(`Occupation du sol indisponible : aucun secteur ni point candidat.${why}`)
    }
    if (land && land.polygons.length === 0) notes.push('Aucun polygone d’occupation du sol dans OpenStreetMap pour cette zone : zone sans donnée, pas « peu favorable ».')
    if (land?.warnings) notes.push(...land.warnings)
    try {
      const { record, timezoneNote } = composeAnalysis(inputs, forecast, land, {
        now, forecastFetchedAt: forecast ? now.toISOString() : null,
        fallbackTimeZone: zone.timeZone, reusedLand: reused ?? undefined,
      })
      if (mine !== token) return
      if (timezoneNote) notes.push(timezoneNote)
      if (land && record.spatial) {
        const spatial = record.spatial
        if (spatial.coverage === 0) notes.push('Couverture cartographique connue : 0 % des cellules de l’emprise. Aucun secteur ne peut être déduit de ces données.')
        else if (spatial.coverage < 1) notes.push(`Couverture cartographique connue : ${(spatial.coverage * 100).toFixed(1)} % des cellules de l’emprise. Les cellules restantes sont sans donnée, pas défavorables.`)
        if (spatial.coverage > 0 && spatial.candidates.length === 0) notes.push('Des données d’occupation du sol sont présentes, mais aucun point candidat ne répond aux critères actuels. Aucun seuil n’a été abaissé.')
      }
      set({ status: 'ready', error: null, result: { record, origin: 'live', notes } })
      if (forecast || land) {
        try {
          await putHuntAnalysis(record)
          if (mine === token) await get().refreshSaved()
        } catch {
          if (mine === token) set((s) => s.result ? { result: { ...s.result, notes: [...s.result.notes, 'Enregistrement hors ligne impossible (stockage).'] } } : s)
        }
      }
    } catch (e) {
      if (mine === token) set({ status: 'error', error: e instanceof Error ? e.message : 'Calcul impossible.' })
    }
  },
}))
