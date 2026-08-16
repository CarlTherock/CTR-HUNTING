import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App startup', () => {
  it('renders the app shell and the dashboard by default', async () => {
    render(<App />)

    // Sidebar brand mark (desktop nav) confirms the shell mounted.
    expect(await screen.findByText('Field Terrain')).toBeInTheDocument()

    // Dashboard is the index route.
    expect(
      await screen.findByRole('heading', { name: 'Field Terrain Intelligence' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Phase 0 — Foundation/i)).toBeInTheDocument()
  })

  it('lists every roadmap phase with phase 0 marked done', async () => {
    render(<App />)

    expect(await screen.findByText(/0\. Foundation/)).toBeInTheDocument()
    expect(screen.getByText(/17\. Commercial Release/)).toBeInTheDocument()
  })
})
