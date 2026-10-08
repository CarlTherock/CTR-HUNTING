import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { useBackupStore } from '@/features/backup/state/backupStore'
import {
  CONFIRMATION_WORD,
  useDataDeletionStore,
  type LocalDataSummary,
} from '../state/dataDeletionStore'

function SummaryList({ summary }: { summary: LocalDataSummary }) {
  const rows: [string, number][] = [
    ['Points de repère', summary.waypoints],
    ['Traces', summary.tracks],
    ['Entrées de journal', summary.observations],
    ['Photos', summary.photos],
    ['Territoires', summary.territories],
    ['Zones de carte hors ligne (et leurs tuiles)', summary.offlineAreas],
    ['Réglages et dernière prévision enregistrée', summary.settings],
  ]
  return (
    <ul className="text-ink-300 text-sm" aria-label="Ce qui sera supprimé">
      {rows.map(([label, count]) => (
        <li key={label} className="flex justify-between gap-3">
          <span>{label}</span>
          <strong className="text-ink-100">{count}</strong>
        </li>
      ))}
    </ul>
  )
}

function BackupFirst() {
  const status = useBackupStore((s) => s.backupStatus)
  const result = useBackupStore((s) => s.backupResult)
  const error = useBackupStore((s) => s.backupError)
  const startBackup = useBackupStore((s) => s.startBackup)
  return (
    <div className="border-surface-700 flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-ink-300 text-sm">
        Une suppression est définitive. Vous pouvez d’abord enregistrer un fichier de
        sauvegarde, à conserver hors de l’application (
        <Link to="/settings#donnees-et-sauvegarde" className="underline">
          options complètes dans Réglages
        </Link>
        ). Sur iPhone, préférez ces options : le téléchargement direct peut être ignoré
        par l’application installée.
      </p>
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={status === 'running'}
          onClick={() => void startBackup()}
        >
          <Download size={14} aria-hidden="true" />
          Sauvegarder d’abord
        </Button>
      </div>
      {status === 'running' && (
        <p role="status" className="text-ink-500 text-xs">
          Sauvegarde en cours…
        </p>
      )}
      {status === 'done' && result && (
        <p role="status" className="text-status-success text-xs">
          Fichier créé : {result.fileName}. Vérifiez qu’il est bien enregistré avant de
          continuer.
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="text-status-danger text-xs">
          La sauvegarde a échoué : {error ?? 'erreur inconnue'}.
        </p>
      )}
    </div>
  )
}

/**
 * « Supprimer mes données » in two explicit steps. Nothing is deleted until the
 * second step's button is pressed with the confirmation word typed; the store
 * enforces that too, so the UI cannot be the only guard.
 */
export function DataDeletionSection() {
  const step = useDataDeletionStore((s) => s.step)
  const summary = useDataDeletionStore((s) => s.summary)
  const blocker = useDataDeletionStore((s) => s.blocker)
  const error = useDataDeletionStore((s) => s.error)
  const cacheWarning = useDataDeletionStore((s) => s.cacheWarning)
  const open = useDataDeletionStore((s) => s.open)
  const goToConfirm = useDataDeletionStore((s) => s.goToConfirm)
  const back = useDataDeletionStore((s) => s.back)
  const cancel = useDataDeletionStore((s) => s.cancel)
  const confirmDelete = useDataDeletionStore((s) => s.confirmDelete)
  const [typed, setTyped] = useState('')

  const matches = typed.trim().toLocaleUpperCase('fr-CA') === CONFIRMATION_WORD

  return (
    <div className="flex flex-col gap-3">
      {step === 'closed' && (
        <div>
          <Button variant="danger" onClick={() => void open()}>
            <Trash2 size={16} aria-hidden="true" />
            Supprimer toutes mes données…
          </Button>
        </div>
      )}

      {step === 'review' && summary && (
        <div className="flex flex-col gap-3" role="group" aria-label="Étape 1 sur 2">
          <p className="text-ink-100 text-sm font-medium">
            Étape 1 sur 2 — voici ce qui sera supprimé de cet appareil
          </p>
          <SummaryList summary={summary} />
          <BackupFirst />
          {blocker && (
            <p role="alert" className="text-status-warning text-sm">
              {blocker}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={blocker !== null} onClick={goToConfirm}>
              Continuer
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTyped('')
                cancel()
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="flex flex-col gap-3" role="group" aria-label="Étape 2 sur 2">
          <p className="text-ink-100 text-sm font-medium">Étape 2 sur 2 — confirmation</p>
          <p className="text-status-danger text-sm">
            Cette suppression est définitive : elle ne peut pas être annulée.
          </p>
          <label className="text-ink-300 flex flex-col gap-1 text-sm">
            Pour confirmer, tapez {CONFIRMATION_WORD}
            <input
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="border-surface-600 bg-surface-950 text-ink-100 h-11 rounded-lg border px-3"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={!matches}
              onClick={() => {
                void confirmDelete(typed).then(() => setTyped(''))
              }}
            >
              Supprimer définitivement
            </Button>
            <Button variant="secondary" onClick={back}>
              Retour
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTyped('')
                cancel()
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {step === 'running' && (
        <p role="status" className="text-ink-300 text-sm">
          Suppression en cours…
        </p>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-status-success text-sm">
            Vos données ont été supprimées de cet appareil.
          </p>
          {cacheWarning && <p className="text-status-warning text-sm">{cacheWarning}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Recharger l’application
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Fermer
            </Button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-status-danger text-sm">
            {error}
          </p>
          <div>
            <Button variant="secondary" onClick={cancel}>
              Fermer
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
