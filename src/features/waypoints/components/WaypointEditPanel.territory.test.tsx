import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '@/database/db'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useWaypointsStore } from '../state/waypointsStore'
import { WaypointEditPanel } from './WaypointEditPanel'

const POSITION = { lat: 46.81234, lng: -71.20456 }

async function seedTerritories() {
  await db.territories.bulkAdd([
    { id: 'nord', name: 'Secteur nord', createdAt: 'x', updatedAt: 'x' },
    { id: 'est', name: 'Secteur est', createdAt: 'x', updatedAt: 'x' },
  ])
  await useTerritoriesStore.getState().load()
}

afterEach(async () => {
  // Unmount first: resetting the stores below must not re-trigger a live page's
  // load effect against a half-cleared database.
  cleanup()
  await db.waypoints.clear()
  await db.territories.clear()
  await db.settings.clear()
  useWaypointsStore.setState({
    waypoints: [],
    loaded: false,
    isPlacing: false,
    draft: null,
    editingId: null,
  })
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
    pendingDelete: null,
    error: null,
  })
})

describe('WaypointEditPanel — territory', () => {
  it('editing a saved waypoint can change its territory without touching its position', async () => {
    await seedTerritories()
    const saved = {
      id: 'w1',
      name: 'Mirador',
      coordinate: POSITION,
      category: 'general' as const,
      territoryId: 'nord',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await db.waypoints.add(saved)
    useWaypointsStore.setState({ waypoints: [saved], loaded: true, editingId: 'w1' })
    const user = userEvent.setup()
    render(<WaypointEditPanel />)

    const select = screen.getByLabelText('Territoire')
    expect(select).toHaveDisplayValue('Secteur nord')
    await user.selectOptions(select, 'Secteur est')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(async () =>
      expect((await db.waypoints.get('w1'))?.territoryId).toBe('est'),
    )
    const stored = await db.waypoints.get('w1')
    expect(stored?.coordinate).toEqual(POSITION)
    expect(stored?.name).toBe('Mirador')
  })

  it('can send a waypoint back to « Non classé »', async () => {
    await seedTerritories()
    const saved = {
      id: 'w1',
      name: 'Mirador',
      coordinate: POSITION,
      category: 'general' as const,
      territoryId: 'nord',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await db.waypoints.add(saved)
    useWaypointsStore.setState({ waypoints: [saved], loaded: true, editingId: 'w1' })
    const user = userEvent.setup()
    render(<WaypointEditPanel />)

    await user.selectOptions(screen.getByLabelText('Territoire'), 'Non classé')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () =>
      expect((await db.waypoints.get('w1'))?.territoryId).toBeUndefined(),
    )
    expect((await db.waypoints.get('w1'))?.coordinate).toEqual(POSITION)
  })

  it('a new waypoint inherits the territory selected as filter and can still be changed', async () => {
    await seedTerritories()
    useTerritoriesStore.getState().setFilter({ kind: 'territory', id: 'nord' })
    useWaypointsStore.getState().startDraftAt(POSITION)
    const user = userEvent.setup()
    render(<WaypointEditPanel />)
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(screen.getByLabelText('Territoire')).toHaveDisplayValue('Secteur nord')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [created] = await db.waypoints.toArray()
    expect(created.territoryId).toBe('nord')
    expect(created.coordinate).toEqual(POSITION)
  })

  it('a new waypoint is « Non classé » when no territory is selected', async () => {
    await seedTerritories()
    useWaypointsStore.getState().startDraftAt(POSITION)
    const user = userEvent.setup()
    render(<WaypointEditPanel />)
    await user.click(screen.getByRole('button', { name: 'Continuer' }))

    expect(screen.getByLabelText('Territoire')).toHaveDisplayValue('Non classé')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await vi.waitFor(async () => expect(await db.waypoints.count()).toBe(1))
    const [created] = await db.waypoints.toArray()
    expect(created.territoryId).toBeUndefined()
  })

  it('the repository still refuses any coordinate change', async () => {
    const { updateWaypoint, WaypointLockedError } =
      await import('@/database/waypointsRepository')
    await expect(
      updateWaypoint('w1', { coordinate: POSITION } as never),
    ).rejects.toBeInstanceOf(WaypointLockedError)
  })
})
