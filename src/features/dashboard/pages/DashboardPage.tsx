import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import { navItems } from '@/app/navigation'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  PageHeader,
  Badge,
} from '@/components/ui'

type PhaseStatus = 'done' | 'in-progress' | 'pending'

/** Kept in sync with `PROJECT_SPECIFICATION.md`'s phase table by hand —
 * that file (not this one) is the authoritative source; this is just its
 * status mirrored into the UI. Update both together. */
const ROADMAP: { phase: number; label: string; status: PhaseStatus }[] = [
  { phase: 0, label: 'Foundation', status: 'done' },
  { phase: 1, label: 'Map', status: 'done' },
  { phase: 2, label: 'Waypoints & Tracks', status: 'done' },
  { phase: 3, label: 'Offline', status: 'done' },
  { phase: 4, label: 'Terrain 3D', status: 'done' },
  { phase: 5, label: 'Weather', status: 'pending' },
  { phase: 6, label: 'Wind', status: 'pending' },
  { phase: 7, label: 'Temporal Data', status: 'pending' },
  { phase: 8, label: 'Analytics Engine', status: 'pending' },
  { phase: 9, label: 'Analysis Map', status: 'pending' },
  { phase: 10, label: 'Advanced Charts', status: 'pending' },
  { phase: 11, label: 'Field Mode', status: 'pending' },
  { phase: 12, label: 'Camera', status: 'pending' },
  { phase: 13, label: 'Journal', status: 'pending' },
  { phase: 14, label: 'AI & Assistant', status: 'pending' },
  { phase: 15, label: 'Synchronization', status: 'pending' },
  { phase: 16, label: 'Testing & Optimization', status: 'pending' },
  { phase: 17, label: 'Commercial Release', status: 'pending' },
]

const currentPhase = ROADMAP.find((p) => p.status !== 'done') ?? ROADMAP[ROADMAP.length - 1]

export function DashboardPage() {
  const isOnline = useOnlineStatus()
  const quickLinks = navItems.filter((item) => item.path !== '/')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="CTR Hunting"
        description="Field Terrain Intelligence — offline-first terrain mapping, navigation and field intelligence."
      />

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Current session</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={isOnline ? 'success' : 'warning'}>
            {isOnline ? 'Online' : 'Offline — app remains usable'}
          </Badge>
          <Badge variant="brand">
            Phase {currentPhase.phase} — {currentPhase.label}
            {currentPhase.status === 'in-progress' ? ' (in progress)' : ''}
          </Badge>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-ink-300 mb-3 text-sm font-semibold">Sections</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <Link key={item.path} to={item.path}>
              <Card className="hover:border-brand-500/50 flex h-full flex-col gap-2 p-4 transition-colors">
                <item.icon size={20} className="text-brand-400" aria-hidden="true" />
                <span className="text-ink-100 text-sm font-medium">{item.label}</span>
                {item.phase !== null && (
                  <span className="text-ink-500 text-xs">Phase {item.phase}</span>
                )}
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-ink-300 mb-3 text-sm font-semibold">Roadmap</h2>
        <Card>
          <CardContent className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {ROADMAP.map((item) => (
              <div key={item.phase} className="flex items-center gap-2 text-sm">
                {item.status === 'done' && (
                  <CheckCircle2 size={16} className="text-brand-400 shrink-0" />
                )}
                {item.status === 'in-progress' && (
                  <CircleDot size={16} className="text-status-warning shrink-0" />
                )}
                {item.status === 'pending' && (
                  <Circle size={16} className="text-ink-700 shrink-0" />
                )}
                <span
                  className={
                    item.status === 'done'
                      ? 'text-ink-100'
                      : item.status === 'in-progress'
                        ? 'text-status-warning'
                        : 'text-ink-500'
                  }
                >
                  {item.phase}. {item.label}
                  {item.status === 'in-progress' ? ' (in progress)' : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
