import { Button } from '@/components/ui'
import type { ConflictMode, RestoreReport } from '../engine/restoreApply'
import type { RestorePlan } from '../engine/restorePlan'
import { TABLE_LABEL, TABLE_ORDER, formatDateFr, wouldAdd } from '../restoreLabels'

interface PreviewProps {
  plan: RestorePlan
  mode: ConflictMode
  busy?: boolean
  onModeChange: (mode: ConflictMode) => void
  onConfirm: () => void
  onCancel: () => void
}

/** Step « aperçu » of a restore: nothing has been written yet. */
export function RestorePreview({
  plan,
  mode,
  busy,
  onModeChange,
  onConfirm,
  onCancel,
}: PreviewProps) {
  const rows = TABLE_ORDER.filter((table) => plan.preview[table])
  const invalid = plan.items.filter((i) => i.status === 'invalid')
  const add = wouldAdd(plan, mode)
  return (
    <section aria-label="Aperçu de la restauration" className="flex flex-col gap-3">
      <p className="text-ink-100 text-sm">
        Sauvegarde du <strong>{formatDateFr(plan.manifest.createdAt)}</strong> ·
        application v{plan.manifest.appVersion} · format {plan.manifest.schemaVersion}
      </p>
      <p className="text-ink-300 text-sm">
        Rien n’a encore été modifié. Restaurer <strong>ajoute</strong> des éléments : rien
        n’est supprimé et aucun élément existant n’est remplacé.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-ink-500 text-xs">
            <tr>
              <th className="py-1 pr-2 font-medium">Type</th>
              <th className="px-2 font-medium">Nouveaux</th>
              <th className="px-2 font-medium">Identiques</th>
              <th className="px-2 font-medium">Conflits</th>
              <th className="px-2 font-medium">Invalides</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((table) => {
              const p = plan.preview[table]
              if (!p) return null
              return (
                <tr key={table} className="border-surface-700 border-t">
                  <th scope="row" className="text-ink-100 py-1 pr-2 font-normal">
                    {TABLE_LABEL[table]}
                  </th>
                  <td className="px-2">{p.new}</td>
                  <td className="px-2">{p.identical}</td>
                  <td className="px-2">{p.conflict}</td>
                  <td className="px-2">{p.invalid + p.unsupported}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {plan.totals.conflict > 0 && (
        <fieldset className="border-surface-700 flex flex-col gap-2 rounded-lg border p-3">
          <legend className="text-ink-100 px-1 text-sm font-medium">
            {plan.totals.conflict} conflit(s) : même identifiant, contenu différent
          </legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="restore-mode"
              checked={mode === 'keep-local'}
              onChange={() => onModeChange('keep-local')}
            />
            <span>
              Conserver mes versions locales <em>(recommandé)</em>. Les versions de la
              sauvegarde sont ignorées et listées dans le rapport.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="restore-mode"
              checked={mode === 'keep-both'}
              onChange={() => onModeChange('keep-both')}
            />
            <span>
              Ajouter aussi les versions de la sauvegarde, comme copies marquées «
              (importé) ». Mes versions locales restent intactes.
            </span>
          </label>
        </fieldset>
      )}

      {invalid.length > 0 && (
        <details className="text-sm">
          <summary className="text-status-warning cursor-pointer">
            {invalid.length} élément(s) invalide(s), qui ne seront pas importés
          </summary>
          <ul className="text-ink-500 mt-1 list-disc pl-5 text-xs">
            {invalid.slice(0, 20).map((item, index) => (
              <li key={`${item.table}-${item.id}-${index}`}>
                {TABLE_LABEL[item.table]} « {item.label} » : {item.reason}
              </li>
            ))}
          </ul>
          {invalid.length > 20 && (
            <p className="text-ink-500 text-xs">… et {invalid.length - 20} autre(s).</p>
          )}
        </details>
      )}

      <ul className="text-ink-500 list-disc pl-5 text-xs">
        {plan.limitations.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onConfirm} disabled={busy || add === 0}>
          {add === 0 ? 'Rien à ajouter' : `Restaurer (ajouter ${add} élément(s))`}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
    </section>
  )
}

/** Final report of a restore. */
export function RestoreReportView({
  report,
  onClose,
}: {
  report: RestoreReport
  onClose: () => void
}) {
  return (
    <section aria-label="Rapport de restauration" className="flex flex-col gap-3 text-sm">
      <p className="text-ink-100">
        <strong>Restauration terminée.</strong> {report.addedTotal} élément(s) ajouté(s),{' '}
        {report.identicalIgnored} ignoré(s) (déjà présents et identiques),{' '}
        {report.conflicts.length} conflit(s), {report.invalid.length} invalide(s)
        {report.unsupported > 0 ? `, ${report.unsupported} non pris en charge ici` : ''}.
      </p>
      {Object.keys(report.added).length > 0 && (
        <ul className="text-ink-300 list-disc pl-5">
          {TABLE_ORDER.filter((t) => report.added[t]).map((t) => (
            <li key={t}>
              {TABLE_LABEL[t]} : {report.added[t]} ajouté(s)
            </li>
          ))}
        </ul>
      )}
      {report.conflicts.length > 0 && (
        <details open>
          <summary className="text-status-warning cursor-pointer">Conflits</summary>
          <ul className="text-ink-300 mt-1 list-disc pl-5 text-xs">
            {report.conflicts.slice(0, 50).map((c, index) => (
              <li key={`${c.table}-${c.id}-${index}`}>
                {TABLE_LABEL[c.table]} « {c.label} » :{' '}
                {c.resolution === 'copy-added'
                  ? 'version locale conservée, copie importée ajoutée'
                  : 'version locale conservée, version de la sauvegarde ignorée'}
              </li>
            ))}
          </ul>
        </details>
      )}
      {report.invalid.length > 0 && (
        <details>
          <summary className="text-status-warning cursor-pointer">
            Éléments invalides (non importés)
          </summary>
          <ul className="text-ink-500 mt-1 list-disc pl-5 text-xs">
            {report.invalid.slice(0, 50).map((i, index) => (
              <li key={`${i.table}-${i.id}-${index}`}>
                {TABLE_LABEL[i.table]} « {i.label} » : {i.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div>
        <Button variant="secondary" onClick={onClose}>
          Fermer le rapport
        </Button>
      </div>
    </section>
  )
}
