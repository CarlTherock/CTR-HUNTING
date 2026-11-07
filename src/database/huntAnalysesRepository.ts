import { db } from './db'
import type { SavedHuntAnalysis } from '@/types'

/** Nombre maximal d'analyses gardées : les plus anciennes (recalculables) laissent la place. */
export const MAX_SAVED_HUNT_ANALYSES = 30

export async function listHuntAnalyses(): Promise<SavedHuntAnalysis[]> {
  const all = await db.huntAnalyses.toArray()
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function getHuntAnalysis(
  id: string,
): Promise<SavedHuntAnalysis | undefined> {
  return db.huntAnalyses.get(id)
}

/**
 * Enregistre (ou remplace) une analyse, dans UNE transaction : en cas d'échec (quota, base
 * fermée), l'enregistrement précédent de même id reste intact. Au-delà de la limite, seules les
 * plus anciennes analyses (cache dérivé) sont retirées.
 */
export async function putHuntAnalysis(record: SavedHuntAnalysis): Promise<void> {
  await db.transaction('rw', db.huntAnalyses, async () => {
    await db.huntAnalyses.put(record)
    const all = await db.huntAnalyses.orderBy('savedAt').toArray()
    const excess = all.length - MAX_SAVED_HUNT_ANALYSES
    if (excess > 0) {
      await db.huntAnalyses.bulkDelete(all.slice(0, excess).map((r) => r.id))
    }
  })
}

export async function deleteHuntAnalysis(id: string): Promise<void> {
  await db.huntAnalyses.delete(id)
}
