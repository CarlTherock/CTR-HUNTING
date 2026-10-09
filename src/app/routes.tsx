import { createBrowserRouter } from 'react-router-dom'
import { StartupFallback } from './StartupFallback'
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
import { DataHubPage, MoreHubPage } from '@/features/hubs/pages/HubPages'

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
        { path: 'data', element: <DataHubPage /> },
        { path: 'more', element: <MoreHubPage /> },
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
        {
          path: 'deertracker',
          lazy: async () => ({
            Component: (await import('@/features/deertracker/pages/DeerTrackerPage'))
              .default,
          }),
        },
        {
          path: 'after-shot',
          lazy: async () => ({
            Component: (await import('@/features/aftershot/pages/AfterShotPage')).default,
          }),
        },
        {
          path: 'after-shot/anatomie',
          lazy: async () => ({
            Component: (await import('@/features/anatomy/pages/AnatomyPage')).default,
          }),
        },
        {
          path: 'project',
          lazy: async () => ({
            Component: (await import('@/features/project/pages/ProjectPage')).default,
          }),
        },
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
