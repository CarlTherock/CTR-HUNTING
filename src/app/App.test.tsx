import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App startup', () => {
  it('renders the app shell and the field home by default', async () => {
    render(<App />)

    // Sidebar brand mark (desktop nav) confirms the shell mounted.
    expect(await screen.findByText('CTR HUNTING')).toBeInTheDocument()

    // The home page is the index route.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'CTR Hunting' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Météo et vent' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Sauvegarde et données' }),
    ).toBeInTheDocument()
  })

  it('no longer shows the developer roadmap on the home page', async () => {
    render(<App />)

    await screen.findByRole('heading', { level: 1, name: 'CTR Hunting' })
    expect(screen.queryByText(/0\. Fondations/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Feuille de route/)).not.toBeInTheDocument()
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
