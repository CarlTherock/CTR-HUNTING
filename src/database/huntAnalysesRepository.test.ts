import { beforeEach, describe, expect, it } from 'vitest'
import type { SavedHuntAnalysis } from '@/types'
import { db } from './db'
import {
  MAX_SAVED_HUNT_ANALYSES,
  deleteHuntAnalysis,
  getHuntAnalysis,
  listHuntAnalyses,
  putHuntAnalysis,
} from './huntAnalysesRepository'

function record(id: string, savedAt: string): SavedHuntAnalysis {
  return {
    id,
    savedAt,
    label: id,
    extentKey: 'k',
    startDateKey: '2026-11-06',
    days: 1,
    timezone: 'America/Toronto',
    engineVersion: '1.0.0',
    registryVersion: '1.1.0',
    hunt: {
      engineVersion: '1.0.0',
      registryVersion: '1.1.0',
      generatedAt: savedAt,
      params: {} as SavedHuntAnalysis['hunt']['params'],
      forecast: null,
      days: [],
      variants: [],
      limits: [],
    },
    spatial: null,
    data: {
      forecastFetchedAt: null,
      forecastSource: null,
      landCoverFetchedAt: null,
      landCoverSource: null,
    },
  }
}

describe('huntAnalysesRepository', () => {
  beforeEach(async () => {
    await db.huntAnalyses.clear()
  })

  it('enregistre, relit, remplace et supprime', async () => {
    await putHuntAnalysis(record('a', '2026-11-06T10:00:00.000Z'))
    expect((await getHuntAnalysis('a'))?.label).toBe('a')
    await putHuntAnalysis({
      ...record('a', '2026-11-06T11:00:00.000Z'),
      label: 'nouveau',
    })
    expect(await db.huntAnalyses.count()).toBe(1)
    expect((await getHuntAnalysis('a'))?.label).toBe('nouveau')
    await deleteHuntAnalysis('a')
    expect(await getHuntAnalysis('a')).toBeUndefined()
  })

  it('liste du plus récent au plus ancien', async () => {
    await putHuntAnalysis(record('old', '2026-11-01T00:00:00.000Z'))
    await putHuntAnalysis(record('new', '2026-11-05T00:00:00.000Z'))
    expect((await listHuntAnalyses()).map((r) => r.id)).toEqual(['new', 'old'])
  })

  it('au-delà de la limite, seules les plus anciennes analyses sont retirées', async () => {
    for (let i = 0; i < MAX_SAVED_HUNT_ANALYSES + 3; i++) {
      await putHuntAnalysis(
        record(`r${i}`, new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString()),
      )
    }
    const ids = (await listHuntAnalyses()).map((r) => r.id)
    expect(ids).toHaveLength(MAX_SAVED_HUNT_ANALYSES)
    expect(ids).toContain(`r${MAX_SAVED_HUNT_ANALYSES + 2}`)
    expect(ids).not.toContain('r0')
  })
})
