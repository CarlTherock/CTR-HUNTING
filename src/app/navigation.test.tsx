import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/components/layout'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { MapPage } from '@/features/map/pages/MapPage'
import { WaypointsPage } from '@/features/waypoints/pages/WaypointsPage'
import { navItems } from './navigation'
import { secondaryPages } from './secondaryPages'

// This is a routing test, not a map test (see MapPage.test.tsx for that) —
// mock the provider so it never depends on whether a real
// VITE_MAP_TILES_API_KEY happens to be set in the local environment.
vi.mock('@/services/map', () => ({ mapProvider: null }))

function renderAt(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'map', element: <MapPage /> },
          { path: 'waypoints', element: <WaypointsPage /> },
          // Same lazy loading as the production route table (routes.tsx).
          {
            path: 'help',
            lazy: async () => ({
              Component: (await import('@/features/help/pages/HelpPage')).default,
            }),
          },
          {
            path: 'privacy',
            lazy: async () => ({
              Component: (await import('@/features/privacy/pages/PrivacyPage')).default,
            }),
          },
          {
            path: 'about',
            lazy: async () => ({
              Component: (await import('@/features/about/pages/AboutPage')).default,
            }),
          },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  return render(<RouterProvider router={router} />)
}

describe('navigation', () => {
  it('navigates to /map and renders the map feature (unavailable state, no API key in tests)', async () => {
    renderAt('/map')

    expect(await screen.findByRole('heading', { name: 'Carte' })).toBeInTheDocument()
    // No VITE_MAP_TILES_API_KEY in the test environment: this is the real,
    // explicit "unavailable" state (see src/services/map/index.ts), not a
    // Phase-0-style placeholder. MapPage.test.tsx covers the configured case
    // with a mocked provider.
    expect(screen.getByText('Carte indisponible')).toBeInTheDocument()
  })

  it('navigates from the dashboard to Waypoints via the sidebar link', async () => {
    const user = userEvent.setup()
    renderAt('/')

    const links = await screen.findAllByRole('link', {
      name: /Points de repère et traces/i,
    })
    await user.click(links[0])

    expect(
      await screen.findByRole('heading', { name: 'Points de repère et traces' }),
    ).toBeInTheDocument()
  })

  it('keeps help, privacy and about out of the sidebar and the bottom bar', () => {
    for (const page of secondaryPages) {
      expect(navItems.map((item) => item.path)).not.toContain(page.path)
    }
    // The mobile bar stays a handful of large targets.
    expect(navItems.filter((item) => item.primary).length).toBeLessThanOrEqual(5)
  })

  it('reaches the help, privacy and about pages from the home page', async () => {
    const user = userEvent.setup()
    renderAt('/')

    const footer = await screen.findByRole('navigation', { name: 'Aide et informations' })
    await user.click(within(footer).getByRole('link', { name: 'Aide' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Aide' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['/help', 'Aide'],
    ['/privacy', 'Confidentialité'],
    ['/about', 'À propos'],
  ])('opens %s directly and titles the mobile bar', async (path, title) => {
    renderAt(path)

    expect(
      await screen.findByRole('heading', { level: 1, name: title }),
    ).toBeInTheDocument()
    const bar = screen.getByRole('banner')
    expect(within(bar).getByText(title)).toBeInTheDocument()
  })

  describe('links to a section of a page', () => {
    const original = Element.prototype.scrollIntoView
    afterEach(() => {
      Element.prototype.scrollIntoView = original
    })

    it('scrolls to the section named by the hash once a lazy page has rendered', async () => {
      const scrollIntoView = vi.fn()
      Element.prototype.scrollIntoView = scrollIntoView
      renderAt('/help#limites-gps')

      await screen.findByRole('heading', { level: 1, name: 'Aide' })
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
      const target = scrollIntoView.mock.contexts[0] as HTMLElement
      expect(target.id).toBe('limites-gps')
    })
  })
})
