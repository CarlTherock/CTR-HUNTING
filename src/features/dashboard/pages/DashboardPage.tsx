import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { useHuntStore } from '@/features/deer-intel/state/huntStore'
import { APP_NAME } from '@/app/appInfo'
import { Badge, PageHeader } from '@/components/ui'
import { InstallPrompt } from '@/features/install/components/InstallPrompt'
import { useFirstRunOnboarding } from '@/features/onboarding/useFirstRunOnboarding'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { DataCard } from '../components/DataCard'
import { FieldActionsCard } from '../components/FieldActionsCard'
import { GuidanceCard } from '../components/GuidanceCard'
import { OfflineCard } from '../components/OfflineCard'
import { OutingCard } from '../components/OutingCard'
import { ProjectProgressCard } from '../components/ProjectProgressCard'
import { QuickAccessCard } from '../components/QuickAccessCard'
import { TerritoryCard } from '../components/TerritoryCard'
import { WeatherCard } from '../components/WeatherCard'

/** Accès direct : choisir un point sur la carte, puis le dashboard « Où et quand chasser ». */
function HuntEntry() {
  const navigate = useNavigate()
  const startPicking = useHuntStore((s) => s.startPicking)
  return (
    <button
      type="button"
      onClick={() => {
        startPicking()
        navigate('/map')
      }}
      className="border-brand-500/50 bg-brand-500/10 text-ink-100 flex min-h-14 w-full items-center gap-3 rounded-lg border px-4 text-left"
    >
      <Compass size={22} aria-hidden="true" className="text-brand-400 shrink-0" />
      <span>
        <span className="block text-sm font-semibold">Où et quand chasser</span>
        <span className="text-ink-300 block text-xs">
          Touchez un point sur la carte : meilleur créneau, graphique et secteurs.
        </span>
      </span>
    </button>
  )
}

/** Loads, once, the data the cards summarise. A store that fails to load
 * simply leaves its card on its empty/loading state. */
function useLoadDashboardData(): void {
  const wpLoaded = useWaypointsStore((s) => s.loaded)
  const wpLoad = useWaypointsStore((s) => s.load)
  const trLoaded = useTracksStore((s) => s.loaded)
  const trLoad = useTracksStore((s) => s.load)
  const joLoaded = useJournalStore((s) => s.loaded)
  const joLoad = useJournalStore((s) => s.load)
  const ofLoaded = useOfflineStore((s) => s.loaded)
  const ofLoad = useOfflineStore((s) => s.load)

  useEffect(() => {
    if (!wpLoaded) void wpLoad().catch(() => undefined)
    if (!trLoaded) void trLoad().catch(() => undefined)
    if (!joLoaded) void joLoad().catch(() => undefined)
    if (!ofLoaded) void ofLoad().catch(() => undefined)
  }, [wpLoaded, wpLoad, trLoaded, trLoad, joLoaded, joLoad, ofLoaded, ofLoad])
}

const FOOTER_LINKS = [
  { to: '/help', label: 'Aide' },
  { to: '/privacy', label: 'Confidentialité' },
  { to: '/about', label: 'À propos' },
] as const

/** Field home: compact cards, mobile first. Reads only data already on the
 * device (plus one weather request on demand) and never asks for a
 * permission. */
export function DashboardPage() {
  const isOnline = useOnlineStatus()
  useFirstRunOnboarding()
  useLoadDashboardData()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={APP_NAME}
        description="Carte, navigation, météo et journal de terrain, utilisables hors ligne."
        actions={
          <Badge variant={isOnline ? 'success' : 'warning'}>
            {isOnline ? 'En ligne' : 'Hors ligne — l’application reste utilisable'}
          </Badge>
        }
      />

      <InstallPrompt />

      <HuntEntry />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <QuickAccessCard />
        <FieldActionsCard />
        <WeatherCard />
        <GuidanceCard />
        <TerritoryCard />
        <OutingCard />
        <OfflineCard />
        <DataCard />
        <ProjectProgressCard />
      </div>

      <nav aria-label="Aide et informations" className="flex flex-wrap gap-x-4 gap-y-1">
        {FOOTER_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="text-ink-300 hover:text-ink-100 inline-flex min-h-11 items-center text-sm underline"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
