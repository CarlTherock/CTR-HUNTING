import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { addPhoto, listPhotosForObservation } from './photosRepository'
import {
  createObservation,
  deleteObservation,
  listObservations,
  updateObservation,
} from './observationsRepository'

const COORDINATE = { lat: 46.8, lng: -71.2 }

describe('observationsRepository (IndexedDB via Dexie)', () => {
  afterEach(async () => {
    await db.observations.clear()
    await db.photos.clear()
  })

  it('starts empty', async () => {
    expect(await listObservations()).toEqual([])
  })

  it('creates an observation with a generated id and real timestamp', async () => {
    const observation = await createObservation({ coordinate: COORDINATE, notes: 'Fresh tracks' })

    expect(observation.id).toBeTruthy()
    expect(observation.timestamp).toBeTruthy()
    expect(observation.notes).toBe('Fresh tracks')
    expect(observation.coordinate).toEqual(COORDINATE)
  })

  it('creates an observation with a real conditions snapshot when provided', async () => {
    const conditions = {
      temperatureCelsius: 12,
      windSpeedKmh: 8,
      windDirectionDegrees: 270,
      cloudCoverPercent: 40,
    }
    const observation = await createObservation({ coordinate: COORDINATE, notes: '', conditions })

    expect(observation.conditions).toEqual(conditions)
  })

  it('creates an observation with no conditions when none were available, never a fabricated one', async () => {
    const observation = await createObservation({ coordinate: COORDINATE, notes: 'No data yet' })

    expect(observation.conditions).toBeUndefined()
  })

  it('links an observation to an existing waypoint when given one', async () => {
    const observation = await createObservation({
      coordinate: COORDINATE,
      notes: '',
      waypointId: 'w1',
    })

    expect(observation.waypointId).toBe('w1')
  })

  it('updates real fields on an observation', async () => {
    const observation = await createObservation({ coordinate: COORDINATE, notes: 'Draft' })

    await updateObservation(observation.id, { notes: 'Final', photoIds: ['p1'] })

    const [reloaded] = await listObservations()
    expect(reloaded.notes).toBe('Final')
    expect(reloaded.photoIds).toEqual(['p1'])
  })

  it('deleting an observation also deletes its photos, never orphaning them', async () => {
    const observation = await createObservation({ coordinate: COORDINATE, notes: '' })
    await addPhoto({ observationId: observation.id, blob: new Blob(['x']) })

    await deleteObservation(observation.id)

    expect(await listObservations()).toEqual([])
    expect(await listPhotosForObservation(observation.id)).toEqual([])
  })
})
