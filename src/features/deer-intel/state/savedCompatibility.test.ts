import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointForecast, SavedHuntAnalysis } from '@/types'
import * as repository from '@/database/huntAnalysesRepository'
import { DEFAULT_INPUTS, composeAnalysis } from './compose'
import { canReuseSavedAnalysis, canReuseSpatial } from './savedCompatibility'
import { SPATIAL_ENGINE_VERSION } from '../spatial/version'

const providers = vi.hoisted(() => ({ weather: vi.fn(), land: vi.fn() }))
vi.mock('@/services/weather', () => ({ weatherProvider: { fetchPointForecast: providers.weather } }))
vi.mock('@/services/landcover/OverpassLandCoverProvider', () => ({ landCoverProvider: { fetchLandCover: providers.land } }))
const { useHuntStore } = await import('./huntStore')
const inputs = { ...DEFAULT_INPUTS, coordinate: { lat: 45.6, lng: -72.9 }, startDateKey: '2026-11-06', days: 1 }
const forecast: PointForecast = { timezone: 'America/Toronto', hourly: [], daily: [] }
function record(): SavedHuntAnalysis {
  return composeAnalysis(inputs, forecast, {
    polygons: [{ id: 'forest', landClass: 'forest', rings: [[
      { lat: 45.5, lng: -73 }, { lat: 45.5, lng: -72.8 },
      { lat: 45.7, lng: -72.8 }, { lat: 45.7, lng: -73 }, { lat: 45.5, lng: -73 },
    ]] }], source: 'test', fetchedAt: '2026-11-06T12:00:00Z',
  }, { now: new Date('2026-11-06T15:00:00Z'), forecastFetchedAt: null, fallbackTimeZone: 'America/Toronto' }).record
}
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
beforeEach(() => {
  useHuntStore.getState().cancel()
  vi.restoreAllMocks()
  providers.weather.mockReset().mockResolvedValue(forecast)
  providers.land.mockReset().mockRejectedValue(new Error('HTTP 502'))
  vi.spyOn(repository, 'listHuntAnalyses').mockResolvedValue([])
  vi.spyOn(repository, 'putHuntAnalysis').mockResolvedValue(undefined)
  useHuntStore.setState({ inputs: { ...inputs }, status: 'idle', result: null, error: null, saved: [] })
})
afterEach(() => { useHuntStore.getState().cancel(); vi.restoreAllMocks() })

describe('compatibilité du cache', () => {
  it('versionne séparément le calcul spatial et accepte le cache courant', () => {
    const r = record()
    expect(r.spatial?.engineVersion).toBe(SPATIAL_ENGINE_VERSION)
    expect(canReuseSpatial(r, inputs, r.extentKey)).toBe(true)
    expect(canReuseSavedAnalysis(r, inputs)).toBe(true)
  })
  it('refuse un ancien moteur spatial et les anciennes clés sans signature', () => {
    const r = record()
    if (!r.spatial) throw new Error('résultat spatial attendu')
    r.spatial.engineVersion = '1.0.0'
    expect(canReuseSpatial(r, inputs, r.extentKey)).toBe(false)
    expect(canReuseSavedAnalysis(r, inputs)).toBe(false)
    const legacy = record()
    legacy.id = legacy.id.split('|').slice(0, 3).join('|')
    expect(canReuseSpatial(legacy, inputs, legacy.extentKey)).toBe(false)
  })
  it('refuse un autre nombre de candidats, un autre lieu et un ancien registre', () => {
    const r = record()
    expect(canReuseSpatial(r, { ...inputs, maxCandidates: 2 }, r.extentKey)).toBe(false)
    expect(canReuseSpatial(r, inputs, 'autre lieu')).toBe(false)
    r.registryVersion = 'obsolete'
    expect(canReuseSavedAnalysis(r, inputs)).toBe(false)
  })
  it('ne réinjecte pas les anciens secteurs et conserve leur consultation explicite', async () => {
    const r = record()
    if (!r.spatial) throw new Error('résultat spatial attendu')
    r.spatial.engineVersion = '1.0.0'
    vi.mocked(repository.listHuntAnalyses).mockResolvedValue([r])
    await useHuntStore.getState().run()
    expect(useHuntStore.getState().result?.record.spatial).toBeNull()
    vi.spyOn(repository, 'getHuntAnalysis').mockResolvedValue(r)
    await useHuntStore.getState().loadSaved(r.id)
    expect(useHuntStore.getState().result?.record.spatial?.engineVersion).toBe('1.0.0')
    expect(useHuntStore.getState().result?.origin).toBe('enregistree')
  })
})

describe('réponses tardives du stockage', () => {
  it('annuler pendant le repli IndexedDB empêche toute publication ou sauvegarde', async () => {
    const pending = deferred<SavedHuntAnalysis[]>()
    vi.mocked(repository.listHuntAnalyses).mockReturnValueOnce(pending.promise)
    const run = useHuntStore.getState().run()
    await vi.waitFor(() => expect(repository.listHuntAnalyses).toHaveBeenCalledTimes(1))
    useHuntStore.getState().cancel()
    pending.resolve([record()])
    await run
    expect(useHuntStore.getState().result).toBeNull()
    expect(useHuntStore.getState().status).toBe('idle')
    expect(repository.putHuntAnalysis).not.toHaveBeenCalled()
  })
  it('un ancien repli ne remplace pas une nouvelle analyse terminée', async () => {
    const pending = deferred<SavedHuntAnalysis[]>()
    vi.mocked(repository.listHuntAnalyses).mockReturnValueOnce(pending.promise)
    const first = useHuntStore.getState().run()
    await vi.waitFor(() => expect(repository.listHuntAnalyses).toHaveBeenCalledTimes(1))
    useHuntStore.getState().setInputs({ startDateKey: '2026-11-07' })
    await useHuntStore.getState().run()
    const latest = useHuntStore.getState().result
    expect(latest?.record.startDateKey).toBe('2026-11-07')
    pending.resolve([record()])
    await first
    expect(useHuntStore.getState().result).toBe(latest)
  })
  it('une lecture explicite ancienne ne remplace pas une sélection plus récente', async () => {
    const pending = deferred<SavedHuntAnalysis | undefined>()
    const r = record()
    vi.spyOn(repository, 'getHuntAnalysis').mockReturnValueOnce(pending.promise).mockResolvedValueOnce(r)
    const first = useHuntStore.getState().loadSaved('ancienne')
    await useHuntStore.getState().loadSaved(r.id)
    const latest = useHuntStore.getState().result
    pending.resolve({ ...r, id: 'ancienne' })
    await first
    expect(useHuntStore.getState().result).toBe(latest)
  })
})
