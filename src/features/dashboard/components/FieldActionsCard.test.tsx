import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { FieldActionsCard } from './FieldActionsCard'

const base = { loaded: true, load: vi.fn().mockResolvedValue(undefined) }

beforeEach(() => useBloodStore.setState({ ...base, sessions: [] }))

const renderCard = () =>
  render(
    <MemoryRouter>
      <FieldActionsCard />
    </MemoryRouter>,
  )

describe('FieldActionsCard', () => {
  it('links blood search, DeerTracker and journal', () => {
    renderCard()
    expect(screen.getByRole('link', { name: 'Recherches de sang' })).toHaveAttribute(
      'href',
      '/waypoints#recherches-de-sang',
    )
    expect(screen.getByRole('link', { name: 'DeerTracker' })).toHaveAttribute(
      'href',
      '/deertracker',
    )
    expect(screen.getByRole('link', { name: 'Journal et photos' })).toHaveAttribute(
      'href',
      '/journal',
    )
  })

  it('offers to resume an open blood-search session', () => {
    useBloodStore.setState({
      sessions: [{ id: 's', name: 'Recherche du 8 octobre', status: 'active' } as never],
    })
    renderCard()
    expect(screen.getByText('Recherche du 8 octobre')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Reprendre sur la carte' })).toHaveAttribute(
      'href',
      '/map',
    )
  })

  it('does not show finished sessions as in progress', () => {
    useBloodStore.setState({
      sessions: [{ id: 's', name: 'Ancienne', status: 'finished' } as never],
    })
    renderCard()
    expect(screen.queryByText(/Recherche de sang en cours/)).not.toBeInTheDocument()
  })
})
