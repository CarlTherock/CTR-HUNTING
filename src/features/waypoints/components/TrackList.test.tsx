import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import { useTracksStore } from '../state/tracksStore'
import { TrackList } from './TrackList'

const points = [
  { lat: 46.8, lng: -71.2, timestamp: '2026-08-16T10:00:05.000Z' },
  { lat: 46.801, lng: -71.2, timestamp: '2026-08-16T10:00:35.000Z' },
]

async function seed() {
  await db.tracks.bulkAdd([
    {
      id: 'done',
      name: 'Crête nord',
      points,
      startedAt: '2026-08-16T10:00:00.000Z',
      endedAt: '2026-08-16T10:30:00.000Z',
      distanceMeters: 111,
    },
    { id: 'cut', name: 'Trace coupée', points, startedAt: '2026-08-17T10:00:00.000Z' },
  ])
  await useTracksStore.getState().load()
}

afterEach(async () => {
  await db.tracks.clear()
  useTracksStore.setState({
    tracks: [],
    loaded: false,
    status: 'idle',
    recordingId: null,
    recordingStartedAt: null,
    points: [],
    distanceMeters: 0,
    persistError: null,
  })
  vi.restoreAllMocks()
})

describe('TrackList', () => {
  it('shows an explicit empty state', () => {
    render(<TrackList />)
    expect(screen.getByText('Aucune trace')).toBeInTheDocument()
  })

  it('asks for confirmation before deleting, and cancelling keeps the track', async () => {
    await seed()
    const user = userEvent.setup()
    render(<TrackList />)

    await user.click(screen.getByRole('button', { name: 'Supprimer Crête nord' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('irréversible')
    expect(await db.tracks.get('done')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await db.tracks.get('done')).toBeDefined()
  })

  it('deletes only after the user confirms', async () => {
    await seed()
    const user = userEvent.setup()
    render(<TrackList />)

    await user.click(screen.getByRole('button', { name: 'Supprimer Crête nord' }))
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))

    await vi.waitFor(async () => expect(await db.tracks.get('done')).toBeUndefined())
    expect(await db.tracks.get('cut')).toBeDefined()
  })

  it('shows a visible error and keeps the track when deletion fails', async () => {
    await seed()
    vi.spyOn(db.tracks, 'delete').mockRejectedValueOnce(new Error('locked'))
    const user = userEvent.setup()
    render(<TrackList />)

    await user.click(screen.getByRole('button', { name: 'Supprimer Crête nord' }))
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de supprimer')
    expect(await db.tracks.get('done')).toBeDefined()
  })

  it('renames a track and persists the new name', async () => {
    await seed()
    const user = userEvent.setup()
    render(<TrackList />)

    await user.click(screen.getByRole('button', { name: 'Renommer Crête nord' }))
    const input = screen.getByLabelText('Nouveau nom de Crête nord')
    await user.clear(input)
    await user.type(input, 'Sentier du lac{Enter}')

    await vi.waitFor(async () =>
      expect((await db.tracks.get('done'))?.name).toBe('Sentier du lac'),
    )
    expect(await screen.findByText('Sentier du lac')).toBeInTheDocument()
  })

  it('flags an interrupted track and lets the user finish it without losing points', async () => {
    await seed()
    const user = userEvent.setup()
    render(<TrackList />)

    expect(screen.getByText('Interrompue')).toBeInTheDocument()
    expect(screen.getByText(/2 points\s+conservés/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Terminer la trace' }))

    await vi.waitFor(async () =>
      expect((await db.tracks.get('cut'))?.endedAt).toBe(points[1].timestamp),
    )
    expect((await db.tracks.get('cut'))?.points).toHaveLength(2)
    expect(screen.queryByText('Interrompue')).not.toBeInTheDocument()
  })

  it('resumes an interrupted track into the same record', async () => {
    await seed()
    const user = userEvent.setup()
    render(<TrackList />)

    await user.click(screen.getByRole('button', { name: 'Reprendre l’enregistrement' }))

    expect(useTracksStore.getState().recordingId).toBe('cut')
    expect(useTracksStore.getState().status).toBe('recording')
  })
})
