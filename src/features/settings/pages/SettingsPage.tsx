import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  PageHeader,
  Badge,
  EmptyState,
} from '@/components/ui'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { estimateStorageUsage } from '@/offline/tileCache'
import { getSetting, setSetting } from '@/database/settingsRepository'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { formatBytes } from '@/utils/format'

const APP_VERSION = '0.1.0'

export function SettingsPage() {
  const isOnline = useOnlineStatus()
  const [installedBefore, setInstalledBefore] = useState<boolean | null>(null)
  const [storageUsage, setStorageUsage] = useState<{ usage: number; quota: number } | null>(null)

  const areas = useOfflineStore((state) => state.areas)
  const loaded = useOfflineStore((state) => state.loaded)
  const load = useOfflineStore((state) => state.load)
  const deleteArea = useOfflineStore((state) => state.deleteArea)

  // Exercises the local persistence layer end-to-end (round-trips through
  // IndexedDB) so Phase 0 ships with at least one real offline read/write,
  // not just a stub.
  useEffect(() => {
    void getSetting('hasOpenedSettings', false).then((value) => {
      setInstalledBefore(value)
      void setSetting('hasOpenedSettings', true)
    })
  }, [])

  useEffect(() => {
    if (!loaded) void load()
    void estimateStorageUsage().then(setStorageUsage)
  }, [loaded, load])

  const completedAreas = areas.filter((area) => area.status !== 'downloading')

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
          <CardTitle>Offline maps</CardTitle>
          <CardDescription>
            Downloaded from the Map page — stored on this device only, not any cloud account
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {storageUsage && (
            <p className="text-ink-500 text-xs">
              {formatBytes(storageUsage.usage)} used of {formatBytes(storageUsage.quota)} available
              to this app
            </p>
          )}
          {completedAreas.length === 0 ? (
            <EmptyState
              title="No offline areas yet"
              description="Open the Map page and tap the download button to save an area."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {completedAreas.map((area) => (
                <div
                  key={area.id}
                  className="border-surface-700 flex items-center justify-between gap-3 rounded-md border p-2.5"
                >
                  <div className="min-w-0">
                    <span className="text-ink-100 block truncate text-sm font-medium">
                      {area.name}
                      {area.status === 'error' && (
                        <span className="text-status-danger ml-2 text-xs font-normal">Failed</span>
                      )}
                      {area.status === 'cancelled' && (
                        <span className="text-ink-500 ml-2 text-xs font-normal">Cancelled</span>
                      )}
                    </span>
                    <span className="text-ink-500 block truncate text-xs">
                      {area.tilesDownloaded} tiles · {formatBytes(area.bytesDownloaded)} · zoom{' '}
                      {area.minZoom}–{area.maxZoom}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteArea(area.id)}
                    aria-label={`Delete ${area.name}`}
                    className="text-ink-500 hover:text-status-danger shrink-0"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
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
          <p className="text-ink-500">Version {APP_VERSION} · Phase 3 — Offline</p>
        </CardContent>
      </Card>
    </div>
  )
}
