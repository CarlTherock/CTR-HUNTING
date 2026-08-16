import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { NotFoundPage } from '@/features/dashboard/pages/NotFoundPage'
import { MapPage } from '@/features/map/pages/MapPage'
import { WaypointsPage } from '@/features/waypoints/pages/WaypointsPage'
import { WeatherPage } from '@/features/weather/pages/WeatherPage'
import { AnalysisPage } from '@/features/analytics/pages/AnalysisPage'
import { JournalPage } from '@/features/journal/pages/JournalPage'
import { SettingsPage } from '@/features/settings/pages/SettingsPage'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'map', element: <MapPage /> },
        { path: 'waypoints', element: <WaypointsPage /> },
        { path: 'weather', element: <WeatherPage /> },
        { path: 'analysis', element: <AnalysisPage /> },
        { path: 'journal', element: <JournalPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // Vite sets BASE_URL from `base` in vite.config.ts — "/" locally, and
  // "/CTR-HUNTING/" on GitHub Pages, where the app is served from a
  // subpath. Without this, every route but "/" 404s on Pages.
  { basename: import.meta.env.BASE_URL },
)
