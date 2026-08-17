import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App startup', () => {
  it('renders the app shell and the dashboard by default', async () => {
    render(<App />)

    // Sidebar brand mark (desktop nav) confirms the shell mounted.
    expect(await screen.findByText('CTR HUNTING')).toBeInTheDocument()

    // Dashboard is the index route.
    expect(await screen.findByRole('heading', { name: 'CTR Hunting' })).toBeInTheDocument()
    expect(screen.getByText(/Phase 7 — Temporal Data/i)).toBeInTheDocument()
  })

  it('lists every roadmap phase with phase 0 marked done', async () => {
    render(<App />)

    expect(await screen.findByText(/0\. Foundation/)).toBeInTheDocument()
    expect(screen.getByText(/17\. Commercial Release/)).toBeInTheDocument()
  })

  it('shows the splash screen only for a standalone/installed launch, not an ordinary tab', () => {
    render(<App />)
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
  })

  it('shows the splash screen when display-mode reports standalone', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
    })) as typeof window.matchMedia

    render(<App />)
    expect(screen.getByRole('presentation')).toBeInTheDocument()

    window.matchMedia = originalMatchMedia
  })
})
