import { useEffect, useRef, useState } from 'react'
import { Download, FileUp, Share2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { formatBytes } from '@/utils/format'
import { canShareFile, downloadBlob, revokeAllDownloadUrls, shareFile } from '../download'
import type { GpxExportScope } from '../gpx/gpxService'
import { describeBackupResult, formatDateFr } from '../restoreLabels'
import { useBackupStore } from '../state/backupStore'
import { useGpxStore } from '../state/gpxStore'
import { RestorePreview, RestoreReportView } from './RestoreViews'
import { GpxImportView } from './GpxViews'

const PERSISTENCE_TEXT = {
  granted:
    'Accordée par le navigateur (moins de risque d’effacement automatique, sans garantie).',
  denied:
    'Non accordée par le navigateur : le stockage de cet appareil peut être effacé.',
  unavailable: 'Indisponible dans ce navigateur.',
  unknown: 'Vérification…',
} as const

/** « Données et sauvegarde » card of the Réglages page (lazy-loaded). */
export function DataBackupSection() {
  const s = useBackupStore()
  const g = useGpxStore()
  const restoreInput = useRef<HTMLInputElement>(null)
  const gpxInput = useRef<HTMLInputElement>(null)
  const [scopeKind, setScopeKind] = useState<GpxExportScope['kind']>('all')
  const [scopeId, setScopeId] = useState('')

  useEffect(() => {
    void useBackupStore.getState().loadStatus()
    void useGpxStore.getState().loadChoices()
    return () => revokeAllDownloadUrls()
  }, [])

  const result = s.backupResult
  const choices = g.choices
  const options =
    scopeKind === 'territory'
      ? choices?.territories
      : scopeKind === 'waypoint'
        ? choices?.waypoints
        : scopeKind === 'track'
          ? choices?.tracks
          : undefined

  function currentScope(): GpxExportScope | null {
    if (scopeKind === 'all') return { kind: 'all' }
    if (!scopeId) return null
    if (scopeKind === 'territory') return { kind: 'territory', territoryId: scopeId }
    if (scopeKind === 'waypoint') return { kind: 'waypoint', waypointId: scopeId }
    return { kind: 'track', trackId: scopeId }
  }

  const busyBackup = s.backupStatus === 'running'
  const busyRestore = s.restoreStatus === 'reading' || s.restoreStatus === 'applying'
  const progress = busyBackup ? s.backupProgress : s.restoreProgress
  const scope = currentScope()

  return (
    <Card id="donnees-et-sauvegarde">
      <CardHeader>
        <CardTitle>Données et sauvegarde</CardTitle>
        <CardDescription>
          Sans compte ni nuage : un fichier que vous gardez vous-même.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 text-sm">
        <div className="text-ink-300 flex flex-col gap-2">
          <p>
            <strong className="text-ink-100">Stockage local</strong> : vos points, traces,
            photos et journal vivent dans la base (IndexedDB) de cet appareil. Si vous
            videz les données du site, ou si iOS libère l’espace d’une app peu utilisée,
            ils disparaissent.
          </p>
          <p>
            <strong className="text-ink-100">Sauvegarde externe</strong> : un fichier .zip
            enregistré <em>hors de l’application</em> (iCloud Drive, ordinateur, courriel
            à vous-même…). C’est lui qui protège vos données. Les tuiles de carte hors
            ligne ne sont pas incluses (seulement leurs zones, à retélécharger).
          </p>
          <p>
            Dernière sauvegarde :{' '}
            <strong className="text-ink-100">
              {s.lastBackupAt ? formatDateFr(s.lastBackupAt) : 'jamais'}
            </strong>{' '}
            <span className="text-ink-500">
              (date de création du fichier ; elle ne prouve pas que vous l’avez conservé)
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-2">
            Protection du stockage : <Badge>{PERSISTENCE_TEXT[s.persistence]}</Badge>
            {s.persistence !== 'granted' && s.persistence !== 'unavailable' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void s.requestPersistence()}
              >
                Demander la protection
              </Button>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void s.startBackup()}
              disabled={busyBackup || busyRestore}
            >
              <Download size={16} aria-hidden="true" />
              Sauvegarder maintenant
            </Button>
            <Button
              variant="secondary"
              onClick={() => restoreInput.current?.click()}
              disabled={busyBackup || busyRestore}
            >
              <FileUp size={16} aria-hidden="true" />
              Restaurer une sauvegarde
            </Button>
            <input
              ref={restoreInput}
              type="file"
              accept=".zip,application/zip"
              hidden
              aria-label="Fichier de sauvegarde à restaurer"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void s.chooseRestoreFile(file)
              }}
            />
          </div>

          {(busyBackup || busyRestore) && (
            <div role="status" className="text-ink-300 flex items-center gap-3">
              <progress
                className="h-2 w-40"
                max={progress?.total || 1}
                value={progress?.done ?? 0}
                aria-label="Progression"
              />
              <span>{progress?.phase ?? 'Préparation…'}</span>
              {s.restoreStatus !== 'applying' && (
                <Button size="sm" variant="ghost" onClick={s.cancel}>
                  Annuler
                </Button>
              )}
            </div>
          )}

          {s.backupStatus === 'error' && (
            <p role="alert" className="text-status-danger">
              Échec de la sauvegarde : {s.backupError}
            </p>
          )}
          {s.backupStatus === 'cancelled' && (
            <p className="text-ink-500">Sauvegarde annulée.</p>
          )}
          {s.backupStatus === 'done' && result && (
            <div
              role="status"
              className="border-surface-700 flex flex-col gap-2 rounded-lg border p-3"
            >
              <p className="text-ink-100">
                Fichier créé : <strong>{result.fileName}</strong> (
                {describeBackupResult(result.bytes, result.photoCount)}).
              </p>
              <p className="text-ink-500 text-xs">
                Si le téléchargement ne démarre pas (fréquent sur iPhone, surtout dans
                l’app installée), utilisez les boutons ci-dessous : le fichier arrive dans
                Fichiers › Téléchargements, ou choisissez « Enregistrer dans Fichiers »
                dans la feuille de partage. Gardez-en une copie ailleurs que sur
                l’appareil.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => downloadBlob(result.blob, result.fileName)}
                >
                  <Download size={14} aria-hidden="true" />
                  Télécharger
                </Button>
                {canShareFile(
                  new File([], result.fileName, { type: 'application/zip' }),
                ) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void shareFile(
                        new File([result.blob], result.fileName, {
                          type: 'application/zip',
                        }),
                        'Sauvegarde CTR Hunting',
                      )
                    }
                  >
                    <Share2 size={14} aria-hidden="true" />
                    Partager / Enregistrer dans Fichiers
                  </Button>
                )}
              </div>
            </div>
          )}

          {s.restoreStatus === 'error' && (
            <p role="alert" className="text-status-danger">
              Restauration refusée : {s.restoreError} Aucune donnée n’a été modifiée.
            </p>
          )}
          {s.restoreStatus === 'cancelled' && (
            <p className="text-ink-500">Restauration annulée. Rien n’a été modifié.</p>
          )}
          {s.plan &&
            (s.restoreStatus === 'preview' || s.restoreStatus === 'applying') && (
              <RestorePreview
                plan={s.plan}
                mode={s.mode}
                busy={s.restoreStatus === 'applying'}
                onModeChange={s.setMode}
                onConfirm={() => void s.confirmRestore()}
                onCancel={s.resetRestore}
              />
            )}
          {s.restoreStatus === 'done' && s.report && (
            <RestoreReportView report={s.report} onClose={s.resetRestore} />
          )}
        </div>

        <div className="border-surface-700 flex flex-col gap-3 border-t pt-4">
          <h4 className="text-ink-100 font-medium">Exporter / importer GPX</h4>
          <p className="text-ink-500 text-xs">
            Format d’échange (autres applis GPS). Points de repère et traces seulement :
            ni photos, ni journal. Pour tout conserver, utilisez la sauvegarde .zip.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-ink-500 text-xs">Exporter</span>
              <select
                className="bg-surface-800 text-ink-100 border-surface-600 h-10 rounded-lg border px-2 pointer-coarse:h-11"
                value={scopeKind}
                onChange={(e) => {
                  setScopeKind(e.target.value as GpxExportScope['kind'])
                  setScopeId('')
                }}
                aria-label="Quoi exporter"
              >
                <option value="all">Tout</option>
                {(choices?.territories.length ?? 0) > 0 && (
                  <option value="territory">Un territoire</option>
                )}
                <option value="waypoint">Un point de repère</option>
                <option value="track">Une trace</option>
              </select>
            </label>
            {options && (
              <select
                className="bg-surface-800 text-ink-100 border-surface-600 h-10 max-w-56 rounded-lg border px-2 pointer-coarse:h-11"
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                aria-label="Élément à exporter"
              >
                <option value="">Choisir…</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="secondary"
              disabled={!scope}
              onClick={() => scope && void g.exportScope(scope)}
            >
              Exporter en GPX
            </Button>
            <Button variant="secondary" onClick={() => gpxInput.current?.click()}>
              Importer un GPX
            </Button>
            <input
              ref={gpxInput}
              type="file"
              accept=".gpx,application/gpx+xml,text/xml,application/xml"
              hidden
              aria-label="Fichier GPX à importer"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void g.chooseImportFile(file)
              }}
            />
          </div>
          {g.exportMessage && <p className="text-ink-300">{g.exportMessage}</p>}
          {g.exportError && (
            <p role="alert" className="text-status-danger">
              {g.exportError}
            </p>
          )}
          <GpxImportView
            status={g.importStatus}
            fileName={g.importFileName}
            error={g.importError}
            parsed={g.parsed}
            plan={g.plan}
            report={g.report}
            onConfirm={() => void g.confirmImport()}
            onClose={g.resetImport}
          />
          <p className="text-ink-500 text-xs">
            Limite d’importation : {formatBytes(10 * 1024 * 1024)} par fichier GPX.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export default DataBackupSection
