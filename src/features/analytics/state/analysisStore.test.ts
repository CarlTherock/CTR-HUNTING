import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOW, makeWeather, makeWindField } from '../testFixtures'
import { useAnalysisStore } from './analysisStore'

const fetchWindField = vi.fn()
vi.mock('@/services/wind', () => ({
  windProvider: { fetchWindField: (...args: unknown[]) => fetchWindField(...args) },
}))
const fetchForecast = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: { fetchForecast: (...args: unknown[]) => fetchForecast(...args) },
}))
const fetchVegetation = vi.fn()
vi.mock('@/services/vegetation', () => ({
  vegetationProvider: {
    fetchVegetation: (...args: unknown[]) => fetchVegetation(...args),
  },
}))

const POINT = { lat: 46.8, lng: -71.2 }

function result(analyzer: string) {
  return useAnalysisStore
    .getState()
    .combined?.results.find((r) => r.analyzer === analyzer)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  useAnalysisStore.setState({
    mode: 'idle',
    status: 'idle',
    coordinate: null,
    combined: null,
    errorReason: null,
    recent: [],
  })
  fetchVegetation.mockResolvedValue(null)
  fetchForecast.mockResolvedValue(makeWeather())
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('analysisStore : heure du vent (défaut corrigé)', () => {
  it('lit le vent de l’heure EN COURS, pas l’entrée d’index 0 (minuit local)', async () => {
    // Minuit : 99 km/h ; toutes les autres heures : 12 km/h.
    fetchWindField.mockResolvedValue(
      makeWindField([POINT], (time) =>
        time === '2026-08-17T00:00' ? { speedKmh: 99 } : { speedKmh: 12 },
      ),
    )
    await useAnalysisStore.getState().analyze(POINT, () => 300)
    const wind = result('wind')
    expect(wind?.factors[0].label).toBe('Vent soutenu')
    expect(wind?.factors[0].explanation).toContain('12 km/h')
    expect(wind?.factors[0].timeLabel).toBe('actuel')
  })

  it('analyse l’heure demandée quand elle est fournie, étiquetée « prévision pour HH:mm »', async () => {
    fetchWindField.mockResolvedValue(
      makeWindField([POINT], (time) =>
        time === '2026-08-17T18:00' ? { speedKmh: 40 } : { speedKmh: 12 },
      ),
    )
    await useAnalysisStore
      .getState()
      .analyze(POINT, () => 300, undefined, '2026-08-17T18:00')
    expect(result('wind')?.factors[0].label).toBe('Vent fort')
    expect(result('wind')?.factors[0].timeLabel).toBe('prévision pour 18:00')
    expect(
      result('weather')?.factors.every((f) => f.timeLabel === 'prévision pour 18:00'),
    ).toBe(true)
  })

  it('la météo d’un point est demandée pour ce point : elle n’est pas « commune à la zone »', async () => {
    fetchWindField.mockResolvedValue(makeWindField([POINT]))
    await useAnalysisStore.getState().analyze(POINT, () => 300)
    expect(result('weather')?.factors.every((f) => f.uniformAcrossArea === false)).toBe(
      true,
    )
  })

  it('une source en échec reste « indisponible » avec sa raison', async () => {
    fetchWindField.mockRejectedValue(new Error('Requête de vent échouée (503)'))
    await useAnalysisStore.getState().analyze(POINT, () => 300)
    expect(result('wind')?.score).toBeNull()
    expect(result('wind')?.unavailableReason).toContain('503')
  })
})
