import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
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

const ROADMAP = [
  { phase: 0, label: 'Foundation', done: true },
  { phase: 1, label: 'Map', done: false },
  { phase: 2, label: 'Waypoints & Tracks', done: false },
  { phase: 3, label: 'Offline', done: false },
  { phase: 4, label: 'Terrain 3D', done: false },
  { phase: 5, label: 'Weather', done: false },
  { phase: 6, label: 'Wind', done: false },
  { phase: 7, label: 'Temporal Data', done: false },
  { phase: 8, label: 'Analytics Engine', done: false },
  { phase: 9, label: 'Analysis Map', done: false },
  { phase: 10, label: 'Advanced Charts', done: false },
  { phase: 11, label: 'Field Mode', done: false },
  { phase: 12, label: 'Camera', done: false },
  { phase: 13, label: 'Journal', done: false },
  { phase: 14, label: 'AI & Assistant', done: false },
  { phase: 15, label: 'Synchronization', done: false },
  { phase: 16, label: 'Testing & Optimization', done: false },
  { phase: 17, label: 'Commercial Release', done: false },
]

export function DashboardPage() {
  const isOnline = useOnlineStatus()
  const quickLinks = navItems.filter((item) => item.path !== '/')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Field Terrain Intelligence"
        description="Offline-first terrain mapping, navigation and field intelligence."
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
          <Badge variant="brand">Phase 0 — Foundation</Badge>
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
                {item.done ? (
                  <CheckCircle2 size={16} className="text-brand-400 shrink-0" />
                ) : (
                  <Circle size={16} className="text-ink-700 shrink-0" />
                )}
                <span className={item.done ? 'text-ink-100' : 'text-ink-500'}>
                  {item.phase}. {item.label}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
