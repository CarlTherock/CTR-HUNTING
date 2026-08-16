import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '@/components/layout'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { MapPage } from '@/features/map/pages/MapPage'
import { WaypointsPage } from '@/features/waypoints/pages/WaypointsPage'

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

    expect(await screen.findByRole('heading', { name: 'Map' })).toBeInTheDocument()
    // No VITE_MAP_TILES_API_KEY in the test environment: this is the real,
    // explicit "unavailable" state (see src/services/map/index.ts), not a
    // Phase-0-style placeholder. MapPage.test.tsx covers the configured case
    // with a mocked provider.
    expect(screen.getByText('Map unavailable')).toBeInTheDocument()
  })

  it('navigates from the dashboard to Waypoints via the sidebar link', async () => {
    const user = userEvent.setup()
    renderAt('/')

    const links = await screen.findAllByRole('link', { name: /Waypoints & Tracks/i })
    await user.click(links[0])

    expect(
      await screen.findByRole('heading', { name: 'Waypoints & Tracks' }),
    ).toBeInTheDocument()
  })
})
