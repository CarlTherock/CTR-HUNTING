import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useCompareStore } from '@/features/compare/state/compareStore'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '../state/tracksStore'
import { useWaypointsStore } from '../state/waypointsStore'
import type { Waypoint } from '@/types'
import { WaypointsPage } from './WaypointsPage'

function wp(id: string, territoryId?: string): Waypoint {
  return {
    id,
    name: `Repère ${id}`,
    coordinate: { lat: 46.8 + Number(id.charCodeAt(0)) / 10000, lng: -71.2 },
    category: 'stand_blind',
    territoryId,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

const loadMock = vi.fn(() => Promise.resolve())

function seed(waypoints: Waypoint[]) {
  useWaypointsStore.setState({ waypoints, loaded: true })
  useTracksStore.setState({ tracks: [], loaded: true })
  useTerritoriesStore.setState({
    territories: [
      {
        id: 't1',
        name: 'Secteur nord',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    loaded: true,
  })
  useCompareStore.setState({
    selectedIds: [],
    panelOpen: false,
    status: 'idle',
    dataset: null,
    load: loadMock,
  })
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WaypointsPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  useWaypointsStore.setState({ waypoints: [], loaded: false })
  useTerritoriesStore.setState({
    territories: [],
    loaded: false,
    filter: { kind: 'all' },
  })
  useCompareStore.setState({ selectedIds: [], panelOpen: false })
  loadMock.mockClear()
})

describe('WaypointsPage — comparison selection', () => {
  it('has one checkbox per waypoint and a "Comparer (N)" button enabled only for 2 to 4', () => {
    seed(['a', 'b', 'c', 'd', 'e'].map((id) => wp(id)))
    renderPage()
    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    const button = screen.getByRole('button', { name: /Comparer \(0\)/ })
    expect(button).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparer : Repère a' }))
    expect(screen.getByRole('button', { name: /Comparer \(1\)/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparer : Repère b' }))
    expect(screen.getByRole('button', { name: /Comparer \(2\)/ })).toBeEnabled()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparer : Repère c' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparer : Repère d' }))
    expect(screen.getByRole('button', { name: /Comparer \(4\)/ })).toBeEnabled()
    // Le 5e ne peut plus être coché.
    expect(screen.getByRole('checkbox', { name: 'Comparer : Repère e' })).toBeDisabled()
  })

  it('opens the comparison panel with the selected waypoints', () => {
    seed(['a', 'b'].map((id) => wp(id)))
    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparer : Repère a' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comparer : Repère b' }))
    expect(screen.queryByRole('region', { name: 'Comparaison de caches' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Comparer \(2\)/ }))
    expect(
      screen.getByRole('region', { name: 'Comparaison de caches' }),
    ).toBeInTheDocument()
    expect(loadMock).toHaveBeenCalled()
  })

  it('respects the territory filter: hidden waypoints leave the selection', () => {
    seed([wp('a', 't1'), wp('b', 't1'), wp('c')])
    renderPage()
    for (const id of ['a', 'b', 'c']) {
      fireEvent.click(screen.getByRole('checkbox', { name: `Comparer : Repère ${id}` }))
    }
    expect(useCompareStore.getState().selectedIds).toEqual(['a', 'b', 'c'])
    act(() => useTerritoriesStore.getState().setFilter({ kind: 'territory', id: 't1' }))
    expect(screen.queryByRole('checkbox', { name: 'Comparer : Repère c' })).toBeNull()
    expect(useCompareStore.getState().selectedIds).toEqual(['a', 'b'])
    expect(screen.getByRole('button', { name: /Comparer \(2\)/ })).toBeEnabled()
  })

  it('keeps the existing row button that opens the waypoint sheet', () => {
    seed([wp('a')])
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /Repère a/ }))
    expect(useWaypointsStore.getState().editingId).toBe('a')
  })
})
