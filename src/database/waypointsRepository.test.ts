import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { createWaypoint, deleteWaypoint, listWaypoints, updateWaypoint } from './waypointsRepository'

describe('waypointsRepository (IndexedDB via Dexie)', () => {
  afterEach(async () => {
    await db.waypoints.clear()
  })

  it('starts empty', async () => {
    expect(await listWaypoints()).toEqual([])
  })

  it('creates a waypoint with a generated id and timestamps', async () => {
    const waypoint = await createWaypoint({
      name: 'Stand near the creek',
      coordinate: { lat: 46.8, lng: -71.2 },
      category: 'stand_blind',
    })

    expect(waypoint.id).toBeTruthy()
    expect(waypoint.createdAt).toBe(waypoint.updatedAt)
    expect(await listWaypoints()).toEqual([waypoint])
  })

  it('persists updates, offline-capable by construction, and bumps updatedAt', async () => {
    const waypoint = await createWaypoint({
      name: 'Trailhead',
      coordinate: { lat: 46.8, lng: -71.2 },
      category: 'trailhead',
    })

    await updateWaypoint(waypoint.id, { name: 'Main trailhead', notes: 'Parking for 3 trucks' })

    const [reloaded] = await listWaypoints()
    expect(reloaded.name).toBe('Main trailhead')
    expect(reloaded.notes).toBe('Parking for 3 trucks')
    expect(reloaded.category).toBe('trailhead') // untouched field preserved
    expect(new Date(reloaded.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(waypoint.updatedAt).getTime(),
    )
  })

  it('deletes a waypoint', async () => {
    const waypoint = await createWaypoint({
      name: 'Water hole',
      coordinate: { lat: 46.8, lng: -71.2 },
      category: 'water',
    })

    await deleteWaypoint(waypoint.id)
    expect(await listWaypoints()).toEqual([])
  })

  it('keeps distinct waypoints independent', async () => {
    const a = await createWaypoint({
      name: 'A',
      coordinate: { lat: 1, lng: 1 },
      category: 'general',
    })
    const b = await createWaypoint({
      name: 'B',
      coordinate: { lat: 2, lng: 2 },
      category: 'general',
    })

    await deleteWaypoint(a.id)

    const remaining = await listWaypoints()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })
})
