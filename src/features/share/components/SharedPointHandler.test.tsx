import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { db } from '@/database/db'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useSharedPointStore } from '../sharedPointStore'
import { SharedPointCard } from './SharedPointCard'
import { SharedPointHandler } from './SharedPointHandler'

function Where() {
  const location = useLocation()
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SharedPointHandler />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(async () => {
  useSharedPointStore.setState({ point: null, notice: null })
  useWaypointsStore.setState({
    waypoints: [],
    draft: null,
    editingId: null,
    isPlacing: false,
  })
  await db.waypoints.clear()
})

describe('SharedPointHandler', () => {
  it('shows a valid link as a preview, goes to /map and strips the query', async () => {
    renderAt('/?p=46.8139,-71.208&n=Mirador')

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/map'))
    expect(screen.getByTestId('where').textContent).toBe('/map')
    expect(useSharedPointStore.getState().point).toEqual({
      coordinate: { lat: 46.8139, lng: -71.208 },
      name: 'Mirador',
    })
    expect(useSharedPointStore.getState().notice).toBeNull()
  })

  it('does not save anything and leaves existing waypoints untouched', async () => {
    const existing = {
      id: 'w1',
      name: 'Existant',
      coordinate: { lat: 1, lng: 2 },
      category: 'general' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    await db.waypoints.put(existing)
    useWaypointsStore.setState({ waypoints: [existing] })

    renderAt('/?p=46.8139,-71.208&n=Mirador')
    await waitFor(() => expect(useSharedPointStore.getState().point).not.toBeNull())

    expect(await db.waypoints.toArray()).toEqual([existing])
    expect(useWaypointsStore.getState().waypoints).toEqual([existing])
    expect(useWaypointsStore.getState().draft).toBeNull()
  })

  it('shows a short French notice for an invalid link and ignores it', async () => {
    renderAt('/?p=999,10&n=Piege')

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Lien de point partagé invalide',
    )
    expect(useSharedPointStore.getState().point).toBeNull()
    expect(screen.getByTestId('where').textContent).toBe('/')
  })

  it('does nothing for an ordinary URL', () => {
    renderAt('/map')
    expect(screen.queryByRole('status')).toBeNull()
    expect(useSharedPointStore.getState().point).toBeNull()
  })

  it('renders an injection attempt in the name as inert text', async () => {
    renderAt(`/?p=1,2&n=${encodeURIComponent('<img src=x onerror=alert(1)>Camp')}`)
    await waitFor(() => expect(useSharedPointStore.getState().point).not.toBeNull())
    const { container } = render(<SharedPointCard onCenter={() => undefined} />)
    expect(container.querySelector('img')).toBeNull()
    expect(
      screen.getByText(/Point partagé : img src=x onerror=alert\(1\)Camp/),
    ).toBeVisible()
  })
})

describe('SharedPointCard', () => {
  const point = { coordinate: { lat: 46.8139, lng: -71.208 }, name: 'Mirador' }

  it('shows name and coordinates with Centrer / Enregistrer / Ignorer', () => {
    useSharedPointStore.setState({ point })
    render(<SharedPointCard onCenter={() => undefined} />)

    expect(screen.getByText('Point partagé : Mirador')).toBeVisible()
    expect(screen.getByText('46,81390° N · 71,20800° O')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Centrer' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Enregistrer comme point de repère' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Ignorer' })).toBeVisible()
  })

  it('Ignorer forgets the preview and writes nothing', async () => {
    useSharedPointStore.setState({ point })
    render(<SharedPointCard onCenter={() => undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ignorer' }))

    expect(useSharedPointStore.getState().point).toBeNull()
    expect(await db.waypoints.count()).toBe(0)
  })

  it('Enregistrer only opens a NEW draft (pre-named); nothing is written yet', async () => {
    useSharedPointStore.setState({ point })
    useWaypointsStore.setState({ waypoints: [] })
    render(<SharedPointCard onCenter={() => undefined} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Enregistrer comme point de repère' }),
    )

    const { draft } = useWaypointsStore.getState()
    expect(draft).toMatchObject({
      coordinate: point.coordinate,
      initialName: 'Mirador',
      saving: false,
    })
    expect(await db.waypoints.count()).toBe(0)
    expect(useSharedPointStore.getState().point).toBeNull()
  })

  it('Centrer calls back without changing anything else', async () => {
    useSharedPointStore.setState({ point })
    let centered = 0
    render(
      <SharedPointCard
        onCenter={() => {
          centered++
        }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Centrer' }))
    expect(centered).toBe(1)
    expect(useSharedPointStore.getState().point).toEqual(point)
  })

  it('steps aside while a waypoint sheet is open', () => {
    useSharedPointStore.setState({ point })
    useWaypointsStore.setState({ editingId: 'x' })
    render(<SharedPointCard onCenter={() => undefined} />)
    expect(screen.queryByTestId('shared-point-card')).toBeNull()
  })
})
