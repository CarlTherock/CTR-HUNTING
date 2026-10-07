import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '../state/tracksStore'
import { TrackList } from './TrackList'

const points = [
  { lat: 46.8, lng: -71.2, timestamp: '2026-08-16T10:00:05.000Z' },
  { lat: 46.801, lng: -71.2, timestamp: '2026-08-16T10:00:35.000Z' },
]

async function seed() {
  await db.territories.add({
    id: 'nord',
    name: 'Secteur nord',
    createdAt: 'x',
    updatedAt: 'x',
  })
  await db.tracks.bulkAdd([
    {
      id: 'a',
      name: 'Crête nord',
      points,
      startedAt: '2026-08-16T10:00:00.000Z',
      endedAt: '2026-08-16T10:30:00.000Z',
      distanceMeters: 111,
      territoryId: 'nord',
    },
    {
      id: 'b',
      name: 'Chemin libre',
      points,
      startedAt: '2026-08-17T10:00:00.000Z',
      endedAt: '2026-08-17T10:30:00.000Z',
      distanceMeters: 222,
    },
  ])
  await useTerritoriesStore.getState().load()
  await useTracksStore.getState().load()
}

afterEach(async () => {
  // Unmount first: resetting the stores below must not re-trigger a live page's
  // load effect against a half-cleared database.
  cleanup()
  await db.tracks.clear()
  await db.territories.clear()
  await db.settings.clear()
  useTracksStore.setState({ tracks: [], loaded: false })
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
    pendingDelete: null,
    error: null,
  })
})

describe('TrackList with territories', () => {
  it('shows every track under « Tous »', async () => {
    await seed()
    render(<TrackList />)
    expect(screen.getByText('Crête nord')).toBeInTheDocument()
    expect(screen.getByText('Chemin libre')).toBeInTheDocument()
    expect(screen.queryByText(/masqué/)).not.toBeInTheDocument()
  })

  it('filters by territory and says how many are hidden', async () => {
    await seed()
    useTerritoriesStore.getState().setFilter({ kind: 'territory', id: 'nord' })
    render(<TrackList />)
    expect(screen.getByText('Crête nord')).toBeInTheDocument()
    expect(screen.queryByText('Chemin libre')).not.toBeInTheDocument()
    expect(screen.getByText('1 élément masqué par le filtre')).toBeInTheDocument()
  })

  it('« Non classé » shows only the tracks without territory', async () => {
    await seed()
    useTerritoriesStore.getState().setFilter({ kind: 'unclassified' })
    render(<TrackList />)
    expect(screen.getByText('Chemin libre')).toBeInTheDocument()
    expect(screen.queryByText('Crête nord')).not.toBeInTheDocument()
  })

  it('explains an empty filter result instead of showing nothing', async () => {
    await seed()
    useTerritoriesStore.getState().setFilter({ kind: 'archived' })
    render(<TrackList />)
    expect(screen.getByText('Aucune trace dans ce territoire')).toBeInTheDocument()
    expect(screen.getByText(/2 éléments masqués par le filtre/)).toBeInTheDocument()
  })

  it('files a track in a territory and back to « Non classé », points untouched', async () => {
    await seed()
    const user = userEvent.setup()
    render(<TrackList />)

    await user.selectOptions(
      screen.getByLabelText('Territoire de Chemin libre'),
      'Secteur nord',
    )
    await vi.waitFor(async () => {
      expect((await db.tracks.get('b'))?.territoryId).toBe('nord')
    })
    expect((await db.tracks.get('b'))?.points).toEqual(points)

    await user.selectOptions(
      screen.getByLabelText('Territoire de Chemin libre'),
      'Non classé',
    )
    await vi.waitFor(async () => {
      expect((await db.tracks.get('b'))?.territoryId).toBeUndefined()
    })
    expect((await db.tracks.get('b'))?.points).toEqual(points)
  })
})
