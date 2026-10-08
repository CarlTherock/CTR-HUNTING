import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/database/db'
import { useBackupStore } from '@/features/backup/state/backupStore'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { CONFIRMATION_WORD, useDataDeletionStore } from '../state/dataDeletionStore'
import { DataDeletionSection } from './DataDeletionSection'

/**
 * « Supprimer mes données ». The Cache Storage API is replaced by a spy (the
 * real one does not exist in jsdom); IndexedDB is a real (in-memory) database,
 * so what is checked is the actual content of the tables.
 */
const NOW = '2026-10-07T12:00:00.000Z'
const cacheDelete = vi.fn()

async function seed() {
  await db.waypoints.add({
    id: 'w1',
    name: 'Mirador',
    coordinate: { lat: 46.8, lng: -71.2 },
    category: 'stand_blind',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await db.tracks.add({
    id: 'tr1',
    name: 'Trace 1',
    points: [],
    startedAt: NOW,
    endedAt: NOW,
  })
  await db.observations.add({
    id: 'o1',
    coordinate: { lat: 46.8, lng: -71.2 },
    timestamp: NOW,
    notes: 'vu un chevreuil',
  })
  await db.settings.put({ key: 'fieldModeEnabled', value: true })
}

async function totalRecords(): Promise<number> {
  const counts = await Promise.all(db.tables.map((table) => table.count()))
  return counts.reduce((a, b) => a + b, 0)
}

function renderSection() {
  return render(
    <MemoryRouter>
      <DataDeletionSection />
    </MemoryRouter>,
  )
}

async function goToConfirmStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Supprimer toutes mes données/ }))
  await screen.findByRole('group', { name: 'Étape 1 sur 2' })
  await user.click(screen.getByRole('button', { name: 'Continuer' }))
  await screen.findByRole('group', { name: 'Étape 2 sur 2' })
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  useDataDeletionStore.setState({
    step: 'closed',
    summary: null,
    blocker: null,
    error: null,
    cacheWarning: null,
  })
  useTracksStore.setState({ tracks: [], loaded: true, status: 'idle', recordingId: null })
  useOfflineStore.setState({ areas: [], loaded: true, mode: 'idle' })
  useWaypointsStore.setState({ waypoints: [], loaded: true })
  useGuidanceStore.setState({ destinationId: null, notice: null })
  cacheDelete.mockReset().mockResolvedValue(true)
  vi.stubGlobal('caches', { delete: cacheDelete })
  await seed()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('deleting all local data', () => {
  it('starts closed and deletes nothing by itself', async () => {
    renderSection()

    expect(
      screen.getByRole('button', { name: /Supprimer toutes mes données/ }),
    ).toBeVisible()
    expect(await totalRecords()).toBe(4)
    expect(cacheDelete).not.toHaveBeenCalled()
  })

  it('step 1 shows what would be deleted and still deletes nothing', async () => {
    const user = userEvent.setup()
    renderSection()

    await user.click(screen.getByRole('button', { name: /Supprimer toutes mes données/ }))

    const step1 = await screen.findByRole('group', { name: 'Étape 1 sur 2' })
    const list = within(step1).getByRole('list', { name: 'Ce qui sera supprimé' })
    expect(within(list).getByText('Points de repère').nextSibling).toHaveTextContent('1')
    expect(within(list).getByText('Traces').nextSibling).toHaveTextContent('1')
    expect(within(list).getByText('Entrées de journal').nextSibling).toHaveTextContent(
      '1',
    )
    expect(
      within(step1).getByRole('button', { name: /Sauvegarder d’abord/ }),
    ).toBeVisible()
    expect(await totalRecords()).toBe(4)
    expect(cacheDelete).not.toHaveBeenCalled()
  })

  it('cancelling at step 1 leaves everything in place', async () => {
    const user = userEvent.setup()
    renderSection()
    await user.click(screen.getByRole('button', { name: /Supprimer toutes mes données/ }))
    await screen.findByRole('group', { name: 'Étape 1 sur 2' })

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(
      screen.getByRole('button', { name: /Supprimer toutes mes données/ }),
    ).toBeVisible()
    expect(await totalRecords()).toBe(4)
  })

  it('step 2 stays disabled until the exact word is typed, and going back deletes nothing', async () => {
    const user = userEvent.setup()
    renderSection()
    await goToConfirmStep(user)

    const confirm = screen.getByRole('button', { name: 'Supprimer définitivement' })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/Pour confirmer, tapez/), 'oui')
    expect(confirm).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Retour' }))
    expect(await screen.findByRole('group', { name: 'Étape 1 sur 2' })).toBeVisible()
    expect(await totalRecords()).toBe(4)
  })

  it('the store itself refuses to delete without the second step or the right word', async () => {
    const { confirmDelete, open } = useDataDeletionStore.getState()

    // Not opened at all.
    expect(await confirmDelete(CONFIRMATION_WORD)).toBe(false)
    // Opened (review), but the confirmation step was not reached.
    await open()
    expect(await useDataDeletionStore.getState().confirmDelete(CONFIRMATION_WORD)).toBe(
      false,
    )
    // Confirmation step, wrong word.
    useDataDeletionStore.getState().goToConfirm()
    expect(useDataDeletionStore.getState().step).toBe('confirm')
    expect(await useDataDeletionStore.getState().confirmDelete('supprimer tout')).toBe(
      false,
    )

    expect(await totalRecords()).toBe(4)
    expect(cacheDelete).not.toHaveBeenCalled()
  })

  it('deletes everything, the map caches and the in-memory copies after both steps', async () => {
    const user = userEvent.setup()
    const waypointsInMemory = [
      {
        id: 'w1',
        name: 'Mirador',
        coordinate: { lat: 46.8, lng: -71.2 },
        category: 'stand_blind' as const,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]
    useWaypointsStore.setState({ waypoints: waypointsInMemory })
    useGuidanceStore.setState({ destinationId: 'w1' })
    renderSection()
    await goToConfirmStep(user)

    await user.type(screen.getByLabelText(/Pour confirmer, tapez/), 'supprimer')
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(await screen.findByText(/Vos données ont été supprimées/)).toBeVisible()
    expect(await totalRecords()).toBe(0)
    expect(cacheDelete).toHaveBeenCalledWith('ctr-hunting-offline-tiles')
    expect(cacheDelete).toHaveBeenCalledWith('ctr-hunting-offline-resources')
    expect(useWaypointsStore.getState().waypoints).toEqual([])
    expect(useGuidanceStore.getState().destinationId).toBeNull()
    expect(screen.getByRole('button', { name: 'Recharger l’application' })).toBeVisible()
  })

  it('refuses while a track is being recorded, and says why', async () => {
    const user = userEvent.setup()
    useTracksStore.setState({ status: 'recording' })
    renderSection()
    await user.click(screen.getByRole('button', { name: /Supprimer toutes mes données/ }))

    await screen.findByRole('group', { name: 'Étape 1 sur 2' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      /enregistrement de trace est en cours/,
    )
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled()
    expect(await totalRecords()).toBe(4)
  })

  it('refuses while a map download is running', async () => {
    const user = userEvent.setup()
    useOfflineStore.setState({ mode: 'downloading' })
    renderSection()
    await user.click(screen.getByRole('button', { name: /Supprimer toutes mes données/ }))

    await screen.findByRole('group', { name: 'Étape 1 sur 2' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      /téléchargement de carte est en cours/,
    )
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeDisabled()
  })

  it('re-checks at confirmation time: a recording started meanwhile blocks the deletion', async () => {
    const user = userEvent.setup()
    renderSection()
    await goToConfirmStep(user)
    useTracksStore.setState({ status: 'recording' })

    await user.type(screen.getByLabelText(/Pour confirmer, tapez/), CONFIRMATION_WORD)
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/enregistrement de trace/)
    expect(await totalRecords()).toBe(4)
    expect(cacheDelete).not.toHaveBeenCalled()
  })

  it('reports a database failure honestly: nothing deleted, caches untouched', async () => {
    const user = userEvent.setup()
    const proto = Object.getPrototypeOf(db.tracks) as { clear: () => Promise<void> }
    vi.spyOn(proto, 'clear').mockRejectedValue(new Error('base verrouillée'))
    renderSection()
    await goToConfirmStep(user)

    await user.type(screen.getByLabelText(/Pour confirmer, tapez/), CONFIRMATION_WORD)
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /base verrouillée.*Aucune donnée n’a été supprimée/,
    )
    expect(await totalRecords()).toBe(4)
    expect(cacheDelete).not.toHaveBeenCalled()
  })

  it('warns when the data is gone but the map caches could not be removed', async () => {
    const user = userEvent.setup()
    cacheDelete.mockRejectedValue(new Error('refusé'))
    renderSection()
    await goToConfirmStep(user)

    await user.type(screen.getByLabelText(/Pour confirmer, tapez/), CONFIRMATION_WORD)
    await user.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))

    expect(await screen.findByText(/Vos données ont été supprimées/)).toBeVisible()
    expect(
      screen.getByText(/tuiles de carte hors ligne n’ont pas pu être retirées/),
    ).toBeVisible()
    expect(await totalRecords()).toBe(0)
  })

  it('offers a backup first, through the existing backup feature', async () => {
    const user = userEvent.setup()
    const startBackup = vi.fn().mockResolvedValue(undefined)
    useBackupStore.setState({ startBackup, backupStatus: 'idle' })
    renderSection()
    await user.click(screen.getByRole('button', { name: /Supprimer toutes mes données/ }))
    await screen.findByRole('group', { name: 'Étape 1 sur 2' })

    await user.click(screen.getByRole('button', { name: /Sauvegarder d’abord/ }))

    expect(startBackup).toHaveBeenCalledTimes(1)
    // Making a backup deletes nothing.
    expect(await totalRecords()).toBe(4)
    await waitFor(() => expect(cacheDelete).not.toHaveBeenCalled())
  })
})
