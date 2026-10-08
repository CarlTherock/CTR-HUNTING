import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useTerritoriesStore } from '../state/territoriesStore'
import { TerritoryFilterBar } from './TerritoryFilterBar'
import { TerritoryManager } from './TerritoryManager'
import { TerritorySelect } from './TerritorySelect'

const HERE = { lat: 46.8, lng: -71.2 }

afterEach(async () => {
  // Unmount first: resetting the stores below must not re-trigger a live page's
  // load effect against a half-cleared database.
  cleanup()
  await Promise.all([
    db.territories.clear(),
    db.waypoints.clear(),
    db.tracks.clear(),
    db.observations.clear(),
    db.settings.clear(),
  ])
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
    pendingDelete: null,
    error: null,
  })
  useWaypointsStore.setState({ waypoints: [], loaded: false })
  useTracksStore.setState({ tracks: [], loaded: false })
  useJournalStore.setState({ observations: [], loaded: false })
})

async function seedOneFull() {
  await db.territories.add({
    id: 'nord',
    name: 'Secteur nord',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  })
  await db.waypoints.bulkAdd([
    {
      id: 'w1',
      name: 'Poste',
      coordinate: HERE,
      category: 'general',
      territoryId: 'nord',
      createdAt: 'x',
      updatedAt: 'x',
    },
    {
      id: 'w2',
      name: 'Libre',
      coordinate: HERE,
      category: 'general',
      createdAt: 'x',
      updatedAt: 'x',
    },
  ])
  await db.tracks.add({
    id: 't1',
    name: 'Trace 1',
    points: [],
    startedAt: '2026-10-01T10:00:00.000Z',
    territoryId: 'nord',
  })
  await db.observations.add({
    id: 'o1',
    coordinate: HERE,
    timestamp: '2026-10-01T10:00:00.000Z',
    notes: 'Traces',
    territoryId: 'nord',
  })
  await Promise.all([
    useTerritoriesStore.getState().load(),
    useWaypointsStore.getState().load(),
    useTracksStore.getState().load(),
    useJournalStore.getState().load(),
  ])
}

describe('TerritoryManager', () => {
  it('always lists « Non classé », even with no territory', async () => {
    render(<TerritoryManager />)
    expect(await screen.findByTestId('unclassified-row')).toHaveTextContent('Non classé')
  })

  it('creates a territory and shows it', async () => {
    const user = userEvent.setup()
    render(<TerritoryManager />)
    await user.type(screen.getByLabelText('Nom du nouveau territoire'), 'Lot du lac')
    await user.click(screen.getByRole('button', { name: 'Créer' }))
    expect(await screen.findByText('Lot du lac')).toBeInTheDocument()
    expect(await db.territories.count()).toBe(1)
    expect(screen.getByLabelText('Nom du nouveau territoire')).toHaveValue('')
  })

  it('refuses a duplicate name with a visible message', async () => {
    await seedOneFull()
    const user = userEvent.setup()
    render(<TerritoryManager />)
    await user.type(screen.getByLabelText('Nom du nouveau territoire'), 'secteur NORD')
    await user.click(screen.getByRole('button', { name: 'Créer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('porte déjà ce nom')
    expect(await db.territories.count()).toBe(1)
  })

  it('renames a territory', async () => {
    await seedOneFull()
    const user = userEvent.setup()
    render(<TerritoryManager />)
    await user.click(screen.getByRole('button', { name: 'Renommer Secteur nord' }))
    const input = screen.getByLabelText('Nouveau nom de Secteur nord')
    await user.clear(input)
    await user.type(input, 'Secteur est{Enter}')
    expect(await screen.findByText('Secteur est')).toBeInTheDocument()
    expect((await db.territories.get('nord'))?.name).toBe('Secteur est')
  })

  it('archives (content untouched) then restores', async () => {
    await seedOneFull()
    const user = userEvent.setup()
    render(<TerritoryManager />)
    await user.click(screen.getByRole('button', { name: 'Archiver Secteur nord' }))
    expect(await screen.findByText('Archivés')).toBeInTheDocument()
    expect((await db.territories.get('nord'))?.archivedAt).toBeTruthy()
    expect(await db.waypoints.count()).toBe(2)
    expect((await db.waypoints.get('w1'))?.territoryId).toBe('nord')

    await user.click(screen.getByRole('button', { name: 'Restaurer Secteur nord' }))
    await vi.waitFor(() => expect(screen.queryByText('Archivés')).not.toBeInTheDocument())
    expect((await db.territories.get('nord'))?.archivedAt).toBeUndefined()
  })

  it('deleting asks for confirmation, states the number of items, and offers only to move them', async () => {
    await seedOneFull()
    const user = userEvent.setup()
    render(<TerritoryManager />)

    await user.click(screen.getByRole('button', { name: 'Supprimer Secteur nord' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('3 éléments')
    expect(dialog).toHaveTextContent('1 point de repère')
    expect(dialog).toHaveTextContent('1 trace')
    expect(dialog).toHaveTextContent('1 entrée de journal')
    expect(dialog).toHaveTextContent('déplacés vers « Non classé »')
    expect(dialog).toHaveTextContent(
      'Aucun point, aucune trace et aucune entrée ne sera supprimé',
    )
    // Nothing happens before confirming.
    expect(await db.territories.count()).toBe(1)

    // Cancel keeps the territory.
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await db.territories.count()).toBe(1)
    expect((await db.waypoints.get('w1'))?.territoryId).toBe('nord')

    // Confirm moves everything to « Non classé » and deletes no data.
    await user.click(screen.getByRole('button', { name: 'Supprimer Secteur nord' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Supprimer le territoire',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      '3 éléments déplacés vers « Non classé »',
    )
    expect(await db.territories.count()).toBe(0)
    expect(await db.waypoints.count()).toBe(2)
    expect(await db.tracks.count()).toBe(1)
    expect(await db.observations.count()).toBe(1)
    expect((await db.waypoints.get('w1'))?.territoryId).toBeUndefined()
    expect(screen.getByTestId('unclassified-row')).toHaveTextContent('2 points de repère')
  })

  it('has touch targets of at least 44 px (min-h-11 / min-w-11) on every action', async () => {
    await seedOneFull()
    render(<TerritoryManager />)
    for (const name of [
      'Renommer Secteur nord',
      'Archiver Secteur nord',
      'Supprimer Secteur nord',
    ]) {
      const button = screen.getByRole('button', { name })
      expect(button.className).toContain('min-h-11')
      expect(button.className).toContain('min-w-11')
    }
  })
})

describe('TerritorySelect', () => {
  it('offers « Non classé » and active territories, not archived ones', async () => {
    await seedOneFull()
    await db.territories.add({
      id: 'vieux',
      name: 'Vieux lot',
      createdAt: 'x',
      updatedAt: 'x',
      archivedAt: 'y',
    })
    await useTerritoriesStore.getState().load()
    render(<TerritorySelect value={undefined} onChange={() => undefined} />)
    const options = within(screen.getByLabelText('Territoire'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Non classé', 'Secteur nord'])
  })

  it('still shows the item’s own territory when it is archived', async () => {
    await db.territories.add({
      id: 'vieux',
      name: 'Vieux lot',
      createdAt: 'x',
      updatedAt: 'x',
      archivedAt: 'y',
    })
    await useTerritoriesStore.getState().load()
    render(<TerritorySelect value="vieux" onChange={() => undefined} />)
    expect(screen.getByLabelText('Territoire')).toHaveDisplayValue('Vieux lot (archivé)')
  })

  it('reports the chosen territory, and undefined for « Non classé »', async () => {
    await seedOneFull()
    const user = userEvent.setup()
    const seen: (string | undefined)[] = []
    render(<TerritorySelect value="nord" onChange={(id) => seen.push(id)} />)
    await user.selectOptions(screen.getByLabelText('Territoire'), 'Non classé')
    expect(seen).toEqual([undefined])
  })
})

describe('TerritoryFilterBar', () => {
  it('lists Tous, active territories, Non classé, and Archivés only when some exist', async () => {
    await seedOneFull()
    const { unmount } = render(<TerritoryFilterBar />)
    expect(
      within(screen.getByLabelText('Territoire'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Tous', 'Secteur nord', 'Non classé'])
    unmount()

    await useTerritoriesStore.getState().archive('nord')
    render(<TerritoryFilterBar />)
    expect(
      within(screen.getByLabelText('Territoire'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Tous', 'Non classé', 'Territoires archivés'])
  })

  it('changing it updates the shared filter', async () => {
    await seedOneFull()
    const user = userEvent.setup()
    render(<TerritoryFilterBar />)
    await user.selectOptions(screen.getByLabelText('Territoire'), 'Secteur nord')
    expect(useTerritoriesStore.getState().filter).toEqual({
      kind: 'territory',
      id: 'nord',
    })
    await user.selectOptions(screen.getByLabelText('Territoire'), 'Non classé')
    expect(useTerritoriesStore.getState().filter).toEqual({ kind: 'unclassified' })
  })
})
