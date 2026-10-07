import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  archiveTerritory,
  countTerritoryContents,
  createTerritory,
  deleteTerritoryKeepingContent,
  listTerritories,
  restoreTerritory,
  updateTerritory,
} from './territoriesRepository'
import { createWaypoint, listWaypoints, updateWaypoint } from './waypointsRepository'
import { createTrack, listTracks, updateTrack } from './tracksRepository'
import {
  createObservation,
  listObservations,
  updateObservation,
} from './observationsRepository'

afterEach(async () => {
  await Promise.all([
    db.territories.clear(),
    db.waypoints.clear(),
    db.tracks.clear(),
    db.observations.clear(),
  ])
})

const POINT = { lat: 46.8, lng: -71.2 }

describe('territoriesRepository (IndexedDB via Dexie)', () => {
  it('starts empty', async () => {
    expect(await listTerritories()).toEqual([])
  })

  it('creates a territory with an id and equal timestamps, no geometry', async () => {
    const territory = await createTerritory({ name: 'Secteur nord' })
    expect(territory.id).toBeTruthy()
    expect(territory.createdAt).toBe(territory.updatedAt)
    expect(territory.archivedAt).toBeUndefined()
    expect(Object.keys(territory).sort()).toEqual(
      ['createdAt', 'id', 'name', 'notes', 'updatedAt'].sort(),
    )
    expect(await listTerritories()).toEqual([territory])
  })

  it('renames and bumps updatedAt', async () => {
    const territory = await createTerritory({ name: 'Nord' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await updateTerritory(territory.id, { name: 'Secteur nord', notes: 'Chemin du lac' })
    const [reloaded] = await listTerritories()
    expect(reloaded.name).toBe('Secteur nord')
    expect(reloaded.notes).toBe('Chemin du lac')
    expect(reloaded.updatedAt > territory.updatedAt).toBe(true)
  })

  it('archives and restores without touching its content', async () => {
    const territory = await createTerritory({ name: 'Lot du lac' })
    const waypoint = await createWaypoint({
      name: 'Poste',
      coordinate: POINT,
      category: 'stand_blind',
      territoryId: territory.id,
    })

    const archivedAt = await archiveTerritory(territory.id)
    expect((await listTerritories())[0].archivedAt).toBe(archivedAt)
    expect((await listWaypoints())[0].territoryId).toBe(territory.id)

    await restoreTerritory(territory.id)
    const [restored] = await listTerritories()
    expect('archivedAt' in restored).toBe(false)
    expect(await listWaypoints()).toEqual([waypoint])
  })

  it('counts waypoints, tracks and observations of a territory only', async () => {
    const a = await createTerritory({ name: 'A' })
    const b = await createTerritory({ name: 'B' })
    await createWaypoint({
      name: 'w1',
      coordinate: POINT,
      category: 'general',
      territoryId: a.id,
    })
    await createWaypoint({
      name: 'w2',
      coordinate: POINT,
      category: 'general',
      territoryId: b.id,
    })
    await createWaypoint({ name: 'w3', coordinate: POINT, category: 'general' })
    await createTrack({
      name: 't',
      startedAt: '2026-10-01T10:00:00.000Z',
      territoryId: a.id,
    })
    await createObservation({ coordinate: POINT, notes: 'o', territoryId: a.id })
    await createObservation({ coordinate: POINT, notes: 'o2', territoryId: a.id })

    expect(await countTerritoryContents(a.id)).toEqual({
      waypoints: 1,
      tracks: 1,
      observations: 2,
    })
    expect(await countTerritoryContents(b.id)).toEqual({
      waypoints: 1,
      tracks: 0,
      observations: 0,
    })
  })

  it('assigns and unassigns a territory (undefined removes the field)', async () => {
    const territory = await createTerritory({ name: 'A' })
    const w = await createWaypoint({ name: 'w', coordinate: POINT, category: 'general' })
    const t = await createTrack({ name: 't', startedAt: '2026-10-01T10:00:00.000Z' })
    const o = await createObservation({ coordinate: POINT, notes: 'o' })

    await updateWaypoint(w.id, { territoryId: territory.id })
    await updateTrack(t.id, { territoryId: territory.id })
    await updateObservation(o.id, { territoryId: territory.id })
    expect((await listWaypoints())[0].territoryId).toBe(territory.id)
    expect((await listTracks())[0].territoryId).toBe(territory.id)
    expect((await listObservations())[0].territoryId).toBe(territory.id)

    await updateWaypoint(w.id, { territoryId: undefined })
    await updateTrack(t.id, { territoryId: undefined })
    await updateObservation(o.id, { territoryId: undefined })
    expect('territoryId' in (await listWaypoints())[0]).toBe(false)
    expect('territoryId' in (await listTracks())[0]).toBe(false)
    expect('territoryId' in (await listObservations())[0]).toBe(false)
  })

  it('assigning a territory never changes a waypoint position', async () => {
    const territory = await createTerritory({ name: 'A' })
    const w = await createWaypoint({ name: 'w', coordinate: POINT, category: 'general' })
    await updateWaypoint(w.id, { territoryId: territory.id })
    expect((await listWaypoints())[0].coordinate).toEqual(POINT)
  })

  it('deleting a territory moves ALL its content to « Non classé » and deletes nothing else', async () => {
    const doomed = await createTerritory({ name: 'À supprimer' })
    const other = await createTerritory({ name: 'Autre' })
    const trackPoints = [
      { lat: 46.8, lng: -71.2, timestamp: '2026-10-01T10:00:05.000Z' },
      { lat: 46.801, lng: -71.2, timestamp: '2026-10-01T10:00:35.000Z' },
    ]
    const w1 = await createWaypoint({
      name: 'w1',
      coordinate: POINT,
      category: 'general',
      territoryId: doomed.id,
    })
    const w2 = await createWaypoint({
      name: 'w2',
      coordinate: POINT,
      category: 'general',
      territoryId: other.id,
    })
    const t1 = await createTrack({
      name: 't1',
      startedAt: '2026-10-01T10:00:00.000Z',
      territoryId: doomed.id,
    })
    await updateTrack(t1.id, { points: trackPoints, distanceMeters: 111 })
    const o1 = await createObservation({
      coordinate: POINT,
      notes: 'o1',
      territoryId: doomed.id,
    })

    const moved = await deleteTerritoryKeepingContent(doomed.id)

    expect(moved).toEqual({ waypoints: 1, tracks: 1, observations: 1 })
    expect((await listTerritories()).map((t) => t.id)).toEqual([other.id])

    const waypoints = await listWaypoints()
    expect(waypoints).toHaveLength(2)
    const movedWaypoint = waypoints.find((w) => w.id === w1.id)
    expect(movedWaypoint?.coordinate).toEqual(POINT)
    expect(movedWaypoint && 'territoryId' in movedWaypoint).toBe(false)
    expect(waypoints.find((w) => w.id === w2.id)?.territoryId).toBe(other.id)

    const [track] = await listTracks()
    expect(track.points).toEqual(trackPoints)
    expect('territoryId' in track).toBe(false)

    const [observation] = await listObservations()
    expect(observation.id).toBe(o1.id)
    expect(observation.notes).toBe('o1')
    expect('territoryId' in observation).toBe(false)
  })

  it('deleting an empty territory just removes it', async () => {
    const territory = await createTerritory({ name: 'Vide' })
    expect(await deleteTerritoryKeepingContent(territory.id)).toEqual({
      waypoints: 0,
      tracks: 0,
      observations: 0,
    })
    expect(await listTerritories()).toEqual([])
  })
})
