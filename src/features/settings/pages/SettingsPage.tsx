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
import { useLocalStorageProbe } from '../state/useLocalStorageProbe'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useFieldModeStore } from '@/features/field-mode/state/fieldModeStore'
import { formatBytes } from '@/utils/format'
import { baseLayerLabel } from '@/features/layers/baseLayerOptions'
import {
  AREA_STATUS_LABEL,
  OFFLINE_DOWNLOAD_EXPLANATION,
  canRetryArea,
  describeRequests,
  describeSteps,
  effectiveAreaStatus,
  type EffectiveAreaStatus,
} from '@/features/offline/areaStatus'

const APP_VERSION = '0.1.0'

const STATUS_BADGE_VARIANT: Record<
  EffectiveAreaStatus,
  'success' | 'warning' | 'danger' | 'neutral'
> = {
  downloading: 'neutral',
  complete: 'success',
  'complete-unverified': 'neutral',
  incomplete: 'warning',
  interrupted: 'warning',
  error: 'danger',
}

export function SettingsPage() {
  const isOnline = useOnlineStatus()
  const localStorageProbe = useLocalStorageProbe()
  const [storageUsage, setStorageUsage] = useState<{
    usage: number
    quota: number
  } | null>(null)

  const areas = useOfflineStore((state) => state.areas)
  const loaded = useOfflineStore((state) => state.loaded)
  const load = useOfflineStore((state) => state.load)
  const deleteArea = useOfflineStore((state) => state.deleteArea)

  const fieldModeEnabled = useFieldModeStore((state) => state.enabled)
  const fieldModeLoaded = useFieldModeStore((state) => state.loaded)
  const loadFieldMode = useFieldModeStore((state) => state.load)
  const toggleFieldMode = useFieldModeStore((state) => state.toggle)

  useEffect(() => {
    if (!loaded) void load()
    // Storage usage is informational: when the estimate fails it simply
    // stays hidden (unavailable), never an unhandled rejection.
    estimateStorageUsage().then(setStorageUsage, () => setStorageUsage(null))
  }, [loaded, load])

  useEffect(() => {
    if (!fieldModeLoaded) void loadFieldMode()
  }, [fieldModeLoaded, loadFieldMode])

  const completedAreas = areas.filter((area) => area.status !== 'downloading')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Réglages"
        description="Informations sur l’application et préférences."
      />

      <Card>
        <CardHeader>
          <CardTitle>Connectivité</CardTitle>
          <CardDescription>État du réseau, en direct</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant={isOnline ? 'success' : 'warning'}>
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mode terrain</CardTitle>
          <CardDescription>
            Interface de carte simplifiée pour l’extérieur : boutons plus grands, vraie
            boussole, et animations du vent et de la carte thermique désactivées pour
            économiser la batterie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fieldModeEnabled}
              onChange={toggleFieldMode}
              aria-label="Mode terrain"
            />
            {fieldModeEnabled ? 'Activé' : 'Désactivé'}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cartes hors ligne</CardTitle>
          <CardDescription>
            Téléchargées depuis la page Carte — stockées sur cet appareil seulement, et
            non dans un compte en ligne
          </CardDescription>
          <p className="text-ink-500 mt-2 text-xs">{OFFLINE_DOWNLOAD_EXPLANATION}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {storageUsage && (
            <p className="text-ink-500 text-xs">
              {formatBytes(storageUsage.usage)} utilisés sur{' '}
              {formatBytes(storageUsage.quota)} disponibles pour cette application
            </p>
          )}
          {completedAreas.length === 0 ? (
            <EmptyState
              title="Aucune zone hors ligne pour le moment"
              description="Ouvrez la page Carte et touchez le bouton de téléchargement pour enregistrer une zone."
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
                    </span>
                    <Badge variant={STATUS_BADGE_VARIANT[effectiveAreaStatus(area)]}>
                      {AREA_STATUS_LABEL[effectiveAreaStatus(area)]}
                    </Badge>
                    <span className="text-ink-500 mt-1 block text-xs">
                      {area.summary
                        ? `${area.tilesDownloaded} tuiles disponibles · `
                        : `${area.tilesDownloaded} tuiles · `}
                      {formatBytes(area.bytesDownloaded)} · zoom {area.minZoom}–
                      {area.maxZoom} · fond « {baseLayerLabel(area.baseLayer)} »
                    </span>
                    {area.summary && (
                      <span className="text-ink-500 block text-xs">
                        {describeRequests(area.summary)} · {describeSteps(area.summary)}
                        {area.summary.retried > 0 &&
                          ` · ${area.summary.retried} nouvelle(s) tentative(s)`}
                      </span>
                    )}
                    {area.lastError && (
                      <span className="text-status-danger block text-xs">
                        {area.lastError}
                      </span>
                    )}
                    {canRetryArea(area) && (
                      <span className="text-ink-500 block text-xs">
                        Pour réessayer : ouvrez la page Carte avec le fond «{' '}
                        {baseLayerLabel(area.baseLayer)} ».
                      </span>
                    )}
                    {area.summary &&
                      (area.summary.failures.length > 0 ||
                        area.summary.essentialFailures.length > 0 ||
                        area.summary.absentUrls.length > 0) && (
                        <details className="text-ink-500 mt-1 text-xs">
                          <summary className="cursor-pointer">Détails</summary>
                          <ul className="mt-1 space-y-0.5 break-all">
                            {area.summary.essentialFailures.map((f) => (
                              <li key={`e-${f.url}`}>
                                Ressource essentielle · {f.reason} · {f.url}
                              </li>
                            ))}
                            {area.summary.failures.map((f) => (
                              <li key={`f-${f.url}`}>
                                Échec · {f.reason} · {f.url}
                              </li>
                            ))}
                            {area.summary.absentUrls.map((u) => (
                              <li key={`a-${u}`}>Tuile absente · {u}</li>
                            ))}
                          </ul>
                          {area.summary.failed > area.summary.failures.length && (
                            <p>
                              … et {area.summary.failed - area.summary.failures.length}{' '}
                              autre(s) échec(s) non listé(s).
                            </p>
                          )}
                        </details>
                      )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void deleteArea(area.id)}
                    aria-label={`Supprimer ${area.name}`}
                    className="text-ink-500 hover:text-status-danger flex shrink-0 items-center justify-center pointer-coarse:size-11"
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
          <CardTitle>Stockage local</CardTitle>
          <CardDescription>
            Basé sur IndexedDB, fonctionne entièrement hors ligne
          </CardDescription>
        </CardHeader>
        <CardContent className="text-ink-300 text-sm">
          {localStorageProbe.status === 'checking'
            ? 'Vérification de la base de données locale…'
            : localStorageProbe.status === 'error'
              ? 'La base de données locale est inaccessible.'
              : localStorageProbe.openedBefore
                ? 'La base de données locale est accessible — session déjà ouverte auparavant.'
                : 'La base de données locale est accessible — c’est la première ouverture des réglages.'}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>À propos</CardTitle>
        </CardHeader>
        <CardContent className="text-ink-300 space-y-1 text-sm">
          <p>Field Terrain Intelligence</p>
          <p className="text-ink-500">Version {APP_VERSION} · Phase 3 — Hors ligne</p>
        </CardContent>
      </Card>
    </div>
  )
}
