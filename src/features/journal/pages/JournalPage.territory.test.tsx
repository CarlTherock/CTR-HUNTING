import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/database/db'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useJournalStore } from '../state/journalStore'
import { JournalPage } from './JournalPage'

vi.mock('@/features/gps/useGeolocation', () => ({
  useGeolocation: () => ({
    status: 'unavailable',
    kind: 'unavailable',
    reason: 'Geolocation is not supported by this browser.',
  }),
}))
vi.mock('@/features/camera/components/CameraCapture', () => ({
  CameraCapture: () => null,
}))

const HERE = { lat: 46.8, lng: -71.2 }

async function seed() {
  await db.territories.add({
    id: 'nord',
    name: 'Secteur nord',
    createdAt: 'x',
    updatedAt: 'x',
  })
  await db.observations.bulkAdd([
    {
      id: 'o1',
      coordinate: HERE,
      timestamp: '2026-10-02T07:00:00.000Z',
      notes: 'Brame au nord',
      territoryId: 'nord',
    },
    {
      id: 'o2',
      coordinate: HERE,
      timestamp: '2026-10-01T07:00:00.000Z',
      notes: 'Piste libre',
    },
  ])
}

function renderPage() {
  return render(
    <MemoryRouter>
      <JournalPage />
    </MemoryRouter>,
  )
}

afterEach(async () => {
  // Unmount first: resetting the stores below must not re-trigger a live page's
  // load effect against a half-cleared database.
  cleanup()
  await db.observations.clear()
  await db.territories.clear()
  await db.photos.clear()
  await db.settings.clear()
  useJournalStore.setState({ observations: [], loaded: false, editingId: null })
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
    pendingDelete: null,
    error: null,
  })
})

describe('JournalPage — territories', () => {
  it('lists every entry under « Tous »', async () => {
    await seed()
    renderPage()
    expect(await screen.findByText('Brame au nord')).toBeInTheDocument()
    expect(screen.getByText('Piste libre')).toBeInTheDocument()
  })

  it('follows the territory filter chosen in the page', async () => {
    await seed()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Brame au nord')
    await user.selectOptions(screen.getByLabelText('Territoire'), 'Secteur nord')
    expect(screen.getByText('Brame au nord')).toBeInTheDocument()
    expect(screen.queryByText('Piste libre')).not.toBeInTheDocument()
    expect(screen.getByText('1 élément masqué par le filtre')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Territoire'), 'Non classé')
    expect(screen.getByText('Piste libre')).toBeInTheDocument()
    expect(screen.queryByText('Brame au nord')).not.toBeInTheDocument()
  })

  it('a new entry is filed in the selected territory', async () => {
    await seed()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Brame au nord')
    await user.selectOptions(screen.getByLabelText('Territoire'), 'Secteur nord')
    await user.click(screen.getByRole('button', { name: 'Nouvelle entrée' }))
    await vi.waitFor(async () => expect(await db.observations.count()).toBe(3))
    const created = (await db.observations.toArray()).find(
      (o) => o.id !== 'o1' && o.id !== 'o2',
    )
    expect(created?.territoryId).toBe('nord')
  })

  it('an entry can be moved to another territory from its edit card', async () => {
    await seed()
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('Piste libre'))
    // Two selects now: the list filter and the entry's own territory.
    const [, entrySelect] = screen.getAllByLabelText('Territoire')
    await user.selectOptions(entrySelect, 'Secteur nord')
    await vi.waitFor(async () =>
      expect((await db.observations.get('o2'))?.territoryId).toBe('nord'),
    )
    expect((await db.observations.get('o2'))?.notes).toBe('Piste libre')
    expect((await db.observations.get('o2'))?.coordinate).toEqual(HERE)
  })
})
