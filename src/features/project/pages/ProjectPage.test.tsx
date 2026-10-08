import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PRIORITIES, ROADMAP, roadmapSummary } from '@/features/about/roadmap'
import ProjectPage from './ProjectPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectPage />
    </MemoryRouter>,
  )
}

describe('ProjectPage', () => {
  it('lists every phase of the roadmap with its real status', () => {
    renderPage()
    const phases = document.getElementById('phases') as HTMLElement
    for (const item of ROADMAP) {
      expect(within(phases).getByText(`${item.phase}. ${item.label}`)).toBeInTheDocument()
    }
    // 18 phases (0 to 17), none dropped.
    expect(ROADMAP.map((p) => p.phase)).toEqual(Array.from({ length: 18 }, (_, i) => i))
  })

  it('never claims a phase 14-17 is finished, nor any device validation', () => {
    for (const item of ROADMAP) {
      if (item.phase >= 14) expect(item.status).not.toBe('done')
      expect(item.validation.device).toBe('no')
    }
    const summary = roadmapSummary()
    expect(summary.done + summary.partial + summary.inProgress + summary.todo).toBe(
      summary.total,
    )
  })

  it('keeps the generative AI status honest and explains it', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('14. IA et assistant'))
    expect(screen.getByText(/L’IA générative n’est PAS activée/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Ouvrir l’assistant' })).toHaveAttribute(
      'href',
      '/assistant',
    )
  })

  it('shows priorities with their explanation, and the version history from the changelog', () => {
    renderPage()
    for (const priority of PRIORITIES) {
      expect(screen.getByText(priority.title)).toBeInTheDocument()
      expect(screen.getByText(priority.why)).toBeInTheDocument()
    }
    const version = document.getElementById('version') as HTMLElement
    expect(version).toHaveTextContent('Recherche de sang')
  })

  it('distinguishes the four validation levels in each phase', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('1. Carte'))
    for (const label of [
      'Implémenté',
      'Tests automatisés',
      'Validation navigateur (services simulés)',
      'Validation appareil réel',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    }
  })
})
