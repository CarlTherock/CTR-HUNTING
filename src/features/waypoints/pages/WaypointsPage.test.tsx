import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/database/db'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '../state/tracksStore'
import { useWaypointsStore } from '../state/waypointsStore'
import { WaypointsPage } from './WaypointsPage'

const HERE = { lat: 46.8, lng: -71.2 }
const base = { category: 'general' as const, createdAt: 'x', updatedAt: 'x' }

async function seed() {
  await db.territories.add({
    id: 'nord',
    name: 'Secteur nord',
    createdAt: 'x',
    updatedAt: 'x',
  })
  await db.waypoints.bulkAdd([
    { ...base, id: 'w1', name: 'Poste du nord', coordinate: HERE, territoryId: 'nord' },
    { ...base, id: 'w2', name: 'Vieille cache', coordinate: HERE },
  ])
  await db.tracks.bulkAdd([
    {
      id: 't1',
      name: 'Trace du nord',
      points: [],
      startedAt: '2026-10-01T10:00:00.000Z',
      endedAt: '2026-10-01T11:00:00.000Z',
      territoryId: 'nord',
    },
    {
      id: 't2',
      name: 'Trace libre',
      points: [],
      startedAt: '2026-10-02T10:00:00.000Z',
      endedAt: '2026-10-02T11:00:00.000Z',
    },
  ])
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WaypointsPage />
    </MemoryRouter>,
  )
}

afterEach(async () => {
  // Unmount first: resetting the stores below must not re-trigger a live page's
  // load effect against a half-cleared database.
  cleanup()
  await Promise.all([
    db.waypoints.clear(),
    db.tracks.clear(),
    db.territories.clear(),
    db.settings.clear(),
  ])
  useWaypointsStore.setState({ waypoints: [], loaded: false, editingId: null })
  useTracksStore.setState({ tracks: [], loaded: false })
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
    pendingDelete: null,
    error: null,
  })
})

describe('WaypointsPage — territories', () => {
  it('shows existing data (no territory) under « Tous » and « Non classé »', async () => {
    await seed()
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Poste du nord')).toBeInTheDocument()
    expect(screen.getByText('Vieille cache')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Territoire'), 'Non classé')
    expect(screen.getByText('Vieille cache')).toBeInTheDocument()
    expect(screen.queryByText('Poste du nord')).not.toBeInTheDocument()
    expect(screen.getByText('Trace libre')).toBeInTheDocument()
    expect(screen.queryByText('Trace du nord')).not.toBeInTheDocument()
  })

  it('one filter drives both the waypoint and the track lists', async () => {
    await seed()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Poste du nord')
    await user.selectOptions(screen.getByLabelText('Territoire'), 'Secteur nord')
    expect(screen.getByText('Poste du nord')).toBeInTheDocument()
    expect(screen.queryByText('Vieille cache')).not.toBeInTheDocument()
    expect(screen.getByText('Trace du nord')).toBeInTheDocument()
    expect(screen.queryByText('Trace libre')).not.toBeInTheDocument()
    expect(screen.getByText(/Points de repère \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Traces \(1\)/)).toBeInTheDocument()
  })

  it('the territory manager is reachable from this page', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.queryByRole('region', { name: 'Gestion des territoires' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Gérer les territoires' }))
    expect(
      screen.getByRole('region', { name: 'Gestion des territoires' }),
    ).toBeInTheDocument()
  })

  it('names the territory of each waypoint in the list', async () => {
    await seed()
    renderPage()
    expect(await screen.findByText(/Secteur nord ·/)).toBeInTheDocument()
  })
})
