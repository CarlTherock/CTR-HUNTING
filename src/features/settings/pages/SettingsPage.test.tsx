import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SettingsPage } from './SettingsPage'
import { estimateStorageUsage } from '@/offline/tileCache'
import { trackUnhandledRejections } from '@/test/unhandledRejections'
import { db } from '@/database/db'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useFieldModeStore } from '@/features/field-mode/state/fieldModeStore'
import { summaryFixture } from '@/test/downloadFixtures'

// jsdom has no Cache Storage API — `deleteArea` (via tileCache.ts)
// touches it to remove a deleted area's tiles, which is exercised for
// real in `tileCache.test.ts`; here only the Dexie/state side is under
// test, so the Cache Storage call is stubbed out.
vi.mock('@/offline/tileCache', () => ({
  deleteTiles: vi.fn().mockResolvedValue(undefined),
  estimateStorageUsage: vi.fn().mockResolvedValue(null),
}))

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

// Seed Dexie, then explicitly await `load()` *before* rendering, rather
// than seeding and letting the component's own mount effect trigger the
// load. Two consecutive tests each mount a fresh `SettingsPage`, and each
// mount fires its own async `load()` — if a previous test's `load()` call
// hadn't fully settled by the time this test's assertions ran, both
// promises would race to call `set()` last, and the loser's stale result
// (from whatever Dexie state existed when *it* started) could silently
// overwrite this test's freshly-seeded data. Awaiting one explicit
// `load()` call up front, with the component already seeing `loaded:
// true` by the time it mounts (so its own effect never fires a second,
// racing call), removes the race entirely instead of trying to out-wait it.
async function renderSettled() {
  await useOfflineStore.getState().load()
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/map" element={<p>Page Carte</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(async () => {
  await db.offlineAreas.clear()
  await db.settings.delete('fieldModeEnabled')
  useOfflineStore.setState({
    areas: [],
    loaded: false,
    mode: 'idle',
    extraZoomLevels: 2,
    selectedBounds: null,
    selectedZoom: null,
    activeAreaId: null,
    downloadProgress: null,
    pendingRetryAreaId: null,
  })
  useFieldModeStore.setState({ enabled: false, loaded: false })
})

describe('SettingsPage', () => {
  it('hides the storage figures, without an unhandled rejection, when the storage estimate fails', async () => {
    const tracker = trackUnhandledRejections()
    vi.mocked(estimateStorageUsage).mockRejectedValueOnce(new Error('estimate failed'))

    await renderSettled()
    await tracker.settle()
    tracker.stop()

    expect(screen.queryByText(/utilisés sur/)).not.toBeInTheDocument()
    expect(tracker.reasons).toEqual([])
  })

  it('shows the empty state when there are no offline areas', async () => {
    await renderSettled()

    expect(screen.getByText('Aucune zone hors ligne pour le moment')).toBeInTheDocument()
  })

  it('lists completed offline areas with their real tile count and size', async () => {
    await db.offlineAreas.add({
      id: 'a1',
      name: 'Camp area',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 14,
      baseLayer: 'outdoor',
      status: 'complete',
      tileCount: 40,
      tilesDownloaded: 40,
      bytesDownloaded: 400_000,
      tileUrls: [],
      createdAt: '2026-08-16T00:00:00.000Z',
      completedAt: '2026-08-16T00:05:00.000Z',
    })

    await renderSettled()

    expect(screen.getByText('Camp area')).toBeInTheDocument()
    expect(screen.getByText(/40 tuiles/)).toBeInTheDocument()
    expect(screen.getByText(/400 Ko/)).toBeInTheDocument()
  })

  it('excludes in-progress downloads from the list (they show on the Map page instead)', async () => {
    useOfflineStore.setState({
      loaded: true,
      areas: [
        {
          id: 'a1',
          name: 'Still downloading',
          bounds: BOUNDS,
          minZoom: 12,
          maxZoom: 14,
          baseLayer: 'outdoor',
          status: 'downloading',
          tileCount: 40,
          tilesDownloaded: 5,
          bytesDownloaded: 50_000,
          tileUrls: [],
          createdAt: '2026-08-16T00:00:00.000Z',
        },
      ],
    })
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Aucune zone hors ligne pour le moment')).toBeInTheDocument()
    expect(screen.queryByText('Still downloading')).not.toBeInTheDocument()
  })

  it('shows a legacy "complete" area as unverified, never as simply ready', async () => {
    await db.offlineAreas.add({
      id: 'old',
      name: 'Ancienne zone',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 14,
      baseLayer: 'outdoor',
      status: 'complete',
      tileCount: 40,
      tilesDownloaded: 40,
      bytesDownloaded: 400_000,
      tileUrls: [],
      createdAt: '2026-08-16T00:00:00.000Z',
    })
    await db.offlineAreas.add({
      id: 'old2',
      name: 'Zone annulée',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 14,
      baseLayer: 'outdoor',
      status: 'cancelled',
      tileCount: 40,
      tilesDownloaded: 3,
      bytesDownloaded: 3_000,
      tileUrls: [],
      createdAt: '2026-08-16T00:00:00.000Z',
    })

    await renderSettled()

    expect(
      screen.getByText('Terminée (ancienne version, non vérifiée)'),
    ).toBeInTheDocument()
    expect(screen.getByText('Interrompue')).toBeInTheDocument()
  })

  it('shows request counts and failures of an incomplete area, plus the retry hint', async () => {
    await db.offlineAreas.add({
      id: 'inc',
      name: 'Zone partielle',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 13,
      baseLayer: 'outdoor',
      status: 'incomplete',
      tileCount: 10,
      tilesDownloaded: 7,
      bytesDownloaded: 7_000,
      tileUrls: [],
      createdAt: '2026-08-16T00:00:00.000Z',
      summary: summaryFixture({
        requested: 10,
        succeeded: 7,
        failed: 3,
        retried: 6,
        failures: [{ url: 'https://tiles.test/12/1/2.pbf', reason: 'HTTP 503' }],
      }),
    })

    await renderSettled()

    expect(screen.getByText('Incomplète')).toBeInTheDocument()
    expect(screen.getByText(/7 requêtes réussies · 3 échecs/)).toBeInTheDocument()
    expect(
      screen.getByText(/Échec · HTTP 503 · https:\/\/tiles\.test\/12\/1\/2\.pbf/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.queryByText(/prête/i)).not.toBeInTheDocument()
  })

  it('«\u00a0Réessayer\u00a0» only for incomplete areas: queues the retry and opens the map', async () => {
    const base = {
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 12,
      baseLayer: 'outdoor' as const,
      tileCount: 4,
      tilesDownloaded: 2,
      bytesDownloaded: 2000,
      tileUrls: [],
      createdAt: '2026-08-16T00:00:00.000Z',
    }
    await db.offlineAreas.add({
      ...base,
      id: 'inc',
      name: 'Zone partielle',
      status: 'incomplete',
      summary: summaryFixture({ requested: 4, succeeded: 2, failed: 2 }),
    })
    await db.offlineAreas.add({
      ...base,
      id: 'ok',
      name: 'Zone complète',
      status: 'complete',
      tilesDownloaded: 4,
      summary: summaryFixture({ requested: 4, succeeded: 4, failed: 0 }),
    })
    const user = userEvent.setup()
    await renderSettled()

    const buttons = screen.getAllByRole('button', { name: 'Réessayer' })
    expect(buttons).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Réessayer' }))

    expect(useOfflineStore.getState().pendingRetryAreaId).toBe('inc')
    expect(screen.getByText('Page Carte')).toBeInTheDocument()
  })

  it('deleting an area removes it from the list and from Dexie', async () => {
    await db.offlineAreas.add({
      id: 'a1',
      name: 'Camp area',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 12,
      baseLayer: 'outdoor',
      status: 'complete',
      tileCount: 4,
      tilesDownloaded: 4,
      bytesDownloaded: 4000,
      tileUrls: [],
      createdAt: '2026-08-16T00:00:00.000Z',
    })
    const user = userEvent.setup()
    await renderSettled()
    expect(screen.getByText('Camp area')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supprimer Camp area' }))

    expect(screen.queryByText('Camp area')).not.toBeInTheDocument()
    expect(await db.offlineAreas.get('a1')).toBeUndefined()
  })

  it('toggles Field Mode and persists the real value to Dexie', async () => {
    const user = userEvent.setup()
    await renderSettled()

    const checkbox = screen.getByLabelText('Mode terrain')
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)

    expect(checkbox).toBeChecked()
    await vi.waitFor(async () => {
      expect((await db.settings.get('fieldModeEnabled'))?.value).toBe(true)
    })
  })
})
