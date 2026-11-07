import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PointForecast } from '@/types'
import { db } from '@/database/db'
import type { LandCoverData } from '../spatial'

const fetchPointForecast = vi.fn()
const fetchLandCover = vi.fn()
vi.mock('@/services/weather', () => ({ weatherProvider: { fetchPointForecast } }))
vi.mock('@/services/landcover/OverpassLandCoverProvider', () => ({
  landCoverProvider: { fetchLandCover },
}))

const { useHuntStore } = await import('./huntStore')
const { DEFAULT_INPUTS, composeAnalysis } = await import('./compose')

const COORD = { lat: 45.6, lng: -72.9 }
const FOREST_RING = [
  { lat: 45.595, lng: -72.906 },
  { lat: 45.595, lng: -72.9 },
  { lat: 45.6, lng: -72.9 },
  { lat: 45.6, lng: -72.906 },
  { lat: 45.595, lng: -72.906 },
]
const FIELD_RING = FOREST_RING.map((p) => ({ lat: p.lat, lng: p.lng + 0.006 }))
const LAND: LandCoverData = {
  polygons: [
    { id: 'f', landClass: 'forest', rings: [FOREST_RING] },
    { id: 'a', landClass: 'agricultural', rings: [FIELD_RING] },
  ],
  source: 'test',
  fetchedAt: '2026-11-06T12:00:00.000Z',
}
const FORECAST: PointForecast = { timezone: 'America/Toronto', hourly: [], daily: [] }

beforeEach(async () => {
  fetchPointForecast.mockReset()
  fetchLandCover.mockReset()
  await db.huntAnalyses.clear()
  useHuntStore.setState({
    inputs: { ...DEFAULT_INPUTS, coordinate: COORD, startDateKey: '2026-11-06', days: 1 },
    status: 'idle',
    result: null,
    error: null,
    saved: [],
  })
})

describe('compose', () => {
  it('utilise le fuseau du lieu donné par la prévision, sinon celui de l’appareil avec avis', () => {
    const inputs = {
      ...DEFAULT_INPUTS,
      coordinate: COORD,
      startDateKey: '2026-11-06',
      days: 1,
    }
    const meta = {
      now: new Date('2026-11-06T15:00:00Z'),
      forecastFetchedAt: null,
      fallbackTimeZone: 'UTC',
    }
    const withTz = composeAnalysis(inputs, FORECAST, null, meta)
    expect(withTz.record.timezone).toBe('America/Toronto')
    expect(withTz.timezoneNote).toBeNull()
    const without = composeAnalysis(inputs, null, null, meta)
    expect(without.record.timezone).toBe('UTC')
    expect(without.timezoneNote).toContain('Fuseau de l’appareil')
  })

  it('refuse sans point GPS', () => {
    expect(() =>
      composeAnalysis({ ...DEFAULT_INPUTS, coordinate: null }, null, null, {
        now: new Date(),
        forecastFetchedAt: null,
        fallbackTimeZone: 'UTC',
      }),
    ).toThrow()
  })
})

describe('huntStore', () => {
  it('sans journal ni observation : calcule et enregistre l’analyse', async () => {
    fetchPointForecast.mockResolvedValue(FORECAST)
    fetchLandCover.mockResolvedValue(LAND)
    await useHuntStore.getState().run()
    const s = useHuntStore.getState()
    expect(s.status).toBe('ready')
    expect(s.result?.origin).toBe('live')
    expect(s.result?.record.spatial?.sectors.length).toBeGreaterThan(0)
    expect(s.result?.record.hunt.days).toHaveLength(1)
    expect(await db.huntAnalyses.count()).toBe(1)
    expect(s.saved).toHaveLength(1)
  })

  it('sans point GPS : erreur claire, aucun appel réseau', async () => {
    useHuntStore.setState({ inputs: { ...DEFAULT_INPUTS, coordinate: null } })
    await useHuntStore.getState().run()
    expect(useHuntStore.getState().status).toBe('error')
    expect(fetchPointForecast).not.toHaveBeenCalled()
  })

  it('un résultat périmé (nouveau calcul lancé) est ignoré', async () => {
    let releaseFirst: (v: PointForecast) => void = () => undefined
    fetchPointForecast.mockImplementationOnce(
      () => new Promise<PointForecast>((r) => (releaseFirst = r)),
    )
    fetchLandCover.mockResolvedValue(null)
    const first = useHuntStore.getState().run()
    fetchPointForecast.mockResolvedValueOnce({
      ...FORECAST,
      timezone: 'America/Montreal',
    })
    await useHuntStore.getState().run()
    expect(useHuntStore.getState().result?.record.timezone).toBe('America/Montreal')
    releaseFirst({ ...FORECAST, timezone: 'Europe/Paris' })
    await first
    expect(useHuntStore.getState().result?.record.timezone).toBe('America/Montreal')
  })

  it('annuler ignore la réponse qui arrive ensuite', async () => {
    let release: (v: PointForecast) => void = () => undefined
    fetchPointForecast.mockImplementationOnce(
      () => new Promise<PointForecast>((r) => (release = r)),
    )
    fetchLandCover.mockResolvedValue(null)
    const p = useHuntStore.getState().run()
    useHuntStore.getState().cancel()
    release(FORECAST)
    await p
    expect(useHuntStore.getState().result).toBeNull()
    expect(useHuntStore.getState().status).toBe('idle')
  })

  it('hors ligne : relit la dernière analyse enregistrée du même endroit', async () => {
    fetchPointForecast.mockResolvedValue(FORECAST)
    fetchLandCover.mockResolvedValue(LAND)
    await useHuntStore.getState().run()
    const savedId = useHuntStore.getState().result?.record.id
    useHuntStore.setState({ result: null, status: 'idle' })

    fetchPointForecast.mockRejectedValue(new Error('hors ligne'))
    fetchLandCover.mockRejectedValue(new Error('hors ligne'))
    await useHuntStore.getState().run()
    const s = useHuntStore.getState()
    expect(s.status).toBe('ready')
    expect(s.result?.origin).toBe('enregistree')
    expect(s.result?.record.id).toBe(savedId)
    expect(s.result?.notes[0]).toContain('Réseau indisponible')
    expect(await db.huntAnalyses.count()).toBe(1)
  })

  it('hors ligne sans analyse enregistrée : seule l’astronomie est calculée, rien n’est inventé ni enregistré', async () => {
    fetchPointForecast.mockRejectedValue(new Error('hors ligne'))
    fetchLandCover.mockRejectedValue(new Error('hors ligne'))
    await useHuntStore.getState().run()
    const s = useHuntStore.getState()
    expect(s.status).toBe('ready')
    expect(s.result?.record.spatial).toBeNull()
    expect(s.result?.record.hunt.forecast).toBeNull()
    expect(s.result?.notes.join(' ')).toContain('activité de référence')
    expect(await db.huntAnalyses.count()).toBe(0)
  })

  it('relit une analyse enregistrée par son identifiant', async () => {
    fetchPointForecast.mockResolvedValue(FORECAST)
    fetchLandCover.mockResolvedValue(LAND)
    await useHuntStore.getState().run()
    const id = useHuntStore.getState().result?.record.id as string
    useHuntStore.setState({ result: null, status: 'idle' })
    await useHuntStore.getState().loadSaved(id)
    expect(useHuntStore.getState().result?.origin).toBe('enregistree')
    expect(useHuntStore.getState().result?.record.spatial?.extent.radiusM).toBe(1000)
  })

  it('météo seule échouée : secteurs conservés, avis affiché', async () => {
    fetchPointForecast.mockRejectedValue(new Error('x'))
    fetchLandCover.mockResolvedValue(LAND)
    await useHuntStore.getState().run()
    const s = useHuntStore.getState()
    expect(s.result?.record.spatial).not.toBeNull()
    expect(s.result?.notes.join(' ')).toContain('Prévision météo indisponible')
  })
})
