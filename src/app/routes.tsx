import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { NotFoundPage } from '@/features/dashboard/pages/NotFoundPage'
import { MapPage } from '@/features/map/pages/MapPage'
import { WaypointsPage } from '@/features/waypoints/pages/WaypointsPage'
import { WeatherPage } from '@/features/weather/pages/WeatherPage'
import { TemporalPage } from '@/features/temporal/pages/TemporalPage'
import { AnalysisPage } from '@/features/analytics/pages/AnalysisPage'
import { JournalPage } from '@/features/journal/pages/JournalPage'
import { SettingsPage } from '@/features/settings/pages/SettingsPage'

function StartupFallback() {
  return (
    <p className="text-ink-500 p-4 text-sm" role="status">
      Chargement…
    </p>
  )
}

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      // Shown only while a deep link to a lazily loaded page (help, privacy,
      // about) is still being fetched at startup.
      HydrateFallback: StartupFallback,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'map', element: <MapPage /> },
        { path: 'waypoints', element: <WaypointsPage /> },
        { path: 'weather', element: <WeatherPage /> },
        { path: 'temporal', element: <TemporalPage /> },
        { path: 'analysis', element: <AnalysisPage /> },
        { path: 'journal', element: <JournalPage /> },
        {
          // Page chargée à la demande : le moteur de l'assistant et ses
          // composants ne pèsent pas sur le démarrage de l'application.
          path: 'assistant',
          lazy: async () => ({
            Component: (await import('@/features/ai/pages/AssistantPage')).AssistantPage,
          }),
        },
        { path: 'settings', element: <SettingsPage /> },
        // Secondary pages: reached from Réglages, the home page and the help
        // links (not from the navigation bars) and loaded on demand so they
        // stay out of the initial bundle.
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
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  // Vite sets BASE_URL from `base` in vite.config.ts — "/" locally, and
  // "/CTR-HUNTING/" on GitHub Pages, where the app is served from a
  // subpath. Without this, every route but "/" 404s on Pages.
  { basename: import.meta.env.BASE_URL },
)
