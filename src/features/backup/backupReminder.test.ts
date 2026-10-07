import { describe, expect, it } from 'vitest'
import { backupReminderMessage, backupReminderState } from './backupReminder'

const NOW = new Date('2026-10-07T12:00:00Z')
const counts = (waypoints: number, tracks = 0, observations = 0) => ({
  waypoints,
  tracks,
  observations,
})
const daysAgo = (n: number, extraMs = 0) =>
  new Date(NOW.getTime() - n * 86_400_000 - extraMs).toISOString()

describe('backupReminderState', () => {
  it('stays quiet with no data at all', () => {
    expect(backupReminderState(NOW, null, counts(0)).show).toBe(false)
    expect(backupReminderState(NOW, daysAgo(100), counts(0)).show).toBe(false)
  })

  it('never backed up: only from 10 items (waypoints + tracks + journal)', () => {
    expect(backupReminderState(NOW, null, counts(9)).show).toBe(false)
    expect(backupReminderState(NOW, null, counts(10))).toMatchObject({
      show: true,
      reason: 'never',
    })
    expect(backupReminderState(NOW, null, counts(4, 3, 3))).toMatchObject({
      show: true,
      reason: 'never',
    })
    expect(backupReminderState(NOW, undefined, counts(10)).show).toBe(true)
  })

  it('backed up: exactly 14 days is fine, more than 14 days is stale', () => {
    expect(backupReminderState(NOW, daysAgo(14), counts(1)).show).toBe(false)
    expect(backupReminderState(NOW, daysAgo(14, 1), counts(1))).toMatchObject({
      show: true,
      reason: 'stale',
      daysSince: 14,
    })
    expect(backupReminderState(NOW, daysAgo(30), counts(1))).toMatchObject({
      show: true,
      daysSince: 30,
    })
    expect(backupReminderState(NOW, daysAgo(1), counts(500)).show).toBe(false)
  })

  it('treats unreadable or future dates as « never »', () => {
    expect(backupReminderState(NOW, 'pas une date', counts(10))).toMatchObject({
      show: true,
      reason: 'never',
    })
    expect(backupReminderState(NOW, 'pas une date', counts(3)).show).toBe(false)
    const future = new Date(NOW.getTime() + 86_400_000).toISOString()
    expect(backupReminderState(NOW, future, counts(10)).reason).toBe('never')
  })

  it('writes a French message for each reason', () => {
    const never = backupReminderState(NOW, null, counts(12))
    const stale = backupReminderState(NOW, daysAgo(20), counts(1))
    if (!never.show || !stale.show) throw new Error('should show')
    expect(backupReminderMessage(never)).toMatch(/12 éléments.*aucune sauvegarde/)
    expect(backupReminderMessage(stale)).toMatch(/20 jours/)
  })
})
