import { Button } from '@/components/ui'
import type { GpxImportPlan, GpxImportReport } from '../gpx/gpxService'
import type { GpxParseResult } from '../gpx/gpxImport'

interface Props {
  status: 'idle' | 'reading' | 'preview' | 'importing' | 'done' | 'error'
  fileName: string | null
  error: string | null
  parsed: GpxParseResult | null
  plan: GpxImportPlan | null
  report: GpxImportReport | null
  onConfirm: () => void
  onClose: () => void
}

/** Preview (before anything is written) and report of a GPX import. Every
 * value from the file is rendered as a React text node, i.e. escaped. */
export function GpxImportView({
  status,
  fileName,
  error,
  parsed,
  plan,
  report,
  onConfirm,
  onClose,
}: Props) {
  if (status === 'idle') return null
  if (status === 'reading') return <p className="text-ink-300">Lecture du fichier GPX…</p>
  if (status === 'error') {
    return (
      <div role="alert" className="flex flex-col gap-2">
        <p className="text-status-danger">Importation GPX refusée : {error}</p>
        <div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    )
  }
  if (status === 'done' && report) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-ink-100">
          Importation terminée : {report.waypointsAdded} point(s) de repère et{' '}
          {report.tracksAdded} trace(s) ajouté(s) ; {report.alreadyPresent} déjà
          présent(s), ignoré(s).
        </p>
        <div>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    )
  }
  if (!parsed || !plan) return null
  const newWaypoints = plan.waypoints.filter((p) => p.status === 'new').length
  const newTracks = plan.tracks.filter((p) => p.status === 'new').length
  const present = plan.waypoints.length + plan.tracks.length - newWaypoints - newTracks
  const invalid = parsed.stats.waypointsInvalid + parsed.stats.tracksSkipped
  return (
    <section aria-label="Aperçu de l’importation GPX" className="flex flex-col gap-2">
      <p className="text-ink-100">
        <strong>{fileName}</strong> : {newWaypoints} nouveau(x) point(s) de repère,{' '}
        {newTracks} nouvelle(s) trace(s), {present} déjà présent(s), {invalid} invalide(s)
        ou ignoré(s) ({parsed.stats.pointsInvalid} point(s) de trace invalide(s)).
      </p>
      <p className="text-ink-500 text-xs">
        Rien n’a encore été ajouté. L’importation n’écrase ni ne supprime rien.
      </p>
      {plan.territoryDropped > 0 && (
        <p className="text-ink-500 text-xs">
          {plan.territoryDropped} élément(s) liés à un territoire inconnu ici : importés
          sans territoire.
        </p>
      )}
      {parsed.issues.length > 0 && (
        <details>
          <summary className="cursor-pointer">Détails ({parsed.issues.length})</summary>
          <ul className="text-ink-500 mt-1 list-disc pl-5 text-xs">
            {parsed.issues.slice(0, 30).map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </details>
      )}
      {newWaypoints > 0 && (
        <ul className="text-ink-300 list-disc pl-5 text-xs">
          {plan.waypoints
            .filter((p) => p.status === 'new')
            .slice(0, 5)
            .map((p) => (
              <li key={p.id}>{p.item.name}</li>
            ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Button
          onClick={onConfirm}
          disabled={status === 'importing' || newWaypoints + newTracks === 0}
        >
          {newWaypoints + newTracks === 0 ? 'Rien à importer' : 'Importer'}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={status === 'importing'}>
          Annuler
        </Button>
      </div>
    </section>
  )
}
