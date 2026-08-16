import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPage } from './SettingsPage'
import { db } from '@/database/db'
import { useOfflineStore } from '@/features/offline/state/offlineStore'

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
  render(<SettingsPage />)
}

afterEach(async () => {
  await db.offlineAreas.clear()
  useOfflineStore.setState({
    areas: [],
    loaded: false,
    mode: 'idle',
    extraZoomLevels: 2,
    selectedBounds: null,
    selectedZoom: null,
    activeAreaId: null,
    downloadProgress: null,
  })
})

describe('SettingsPage', () => {
  it('shows the empty state when there are no offline areas', async () => {
    await renderSettled()

    expect(screen.getByText('No offline areas yet')).toBeInTheDocument()
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
    expect(screen.getByText(/40 tiles/)).toBeInTheDocument()
    expect(screen.getByText(/400 KB/)).toBeInTheDocument()
  })

  it('excludes in-progress downloads from the list (they show on the Map page instead)', async () => {
    await db.offlineAreas.add({
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
    })

    await renderSettled()

    expect(screen.getByText('No offline areas yet')).toBeInTheDocument()
    expect(screen.queryByText('Still downloading')).not.toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: 'Delete Camp area' }))

    expect(screen.queryByText('Camp area')).not.toBeInTheDocument()
    expect(await db.offlineAreas.get('a1')).toBeUndefined()
  })
})
