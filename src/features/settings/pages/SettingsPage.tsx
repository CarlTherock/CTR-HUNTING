import { useEffect, useState } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  PageHeader,
  Badge,
} from '@/components/ui'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { getSetting, setSetting } from '@/database/settingsRepository'

const APP_VERSION = '0.1.0'

export function SettingsPage() {
  const isOnline = useOnlineStatus()
  const [installedBefore, setInstalledBefore] = useState<boolean | null>(null)

  // Exercises the local persistence layer end-to-end (round-trips through
  // IndexedDB) so Phase 0 ships with at least one real offline read/write,
  // not just a stub.
  useEffect(() => {
    void getSetting('hasOpenedSettings', false).then((value) => {
      setInstalledBefore(value)
      void setSetting('hasOpenedSettings', true)
    })
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="App information and preferences." />

      <Card>
        <CardHeader>
          <CardTitle>Connectivity</CardTitle>
          <CardDescription>Live browser network status</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant={isOnline ? 'success' : 'warning'}>
            {isOnline ? 'Online' : 'Offline'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Local storage</CardTitle>
          <CardDescription>IndexedDB-backed, works fully offline</CardDescription>
        </CardHeader>
        <CardContent className="text-ink-300 text-sm">
          {installedBefore === null
            ? 'Checking local database…'
            : installedBefore
              ? 'Local database is reachable — this is a returning session.'
              : 'Local database is reachable — this is the first time settings were opened.'}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="text-ink-300 space-y-1 text-sm">
          <p>Field Terrain Intelligence</p>
          <p className="text-ink-500">Version {APP_VERSION} · Phase 0 — Foundation</p>
        </CardContent>
      </Card>
    </div>
  )
}
