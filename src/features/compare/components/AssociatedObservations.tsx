import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui'
import { formatDistanceMeters } from '@/utils/format'
import { openJournalEntry, openWaypointSheet } from '../compareActions'
import type { NearbyRecord, WaypointComparison } from '../types'

function RecordList({
  title,
  items,
  empty,
  actionLabel,
  onOpen,
}: {
  title: string
  items: NearbyRecord[]
  empty: string
  actionLabel: string
  onOpen: (record: NearbyRecord) => void
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h4 className="text-ink-300 text-xs font-semibold">
        {title} ({items.length})
      </h4>
      {items.length === 0 ? (
        <p className="text-ink-500 text-xs">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((record) => (
            <li key={record.id} className="flex items-center gap-2">
              <span className="text-ink-100 min-w-0 flex-1 text-sm break-words">
                {record.label}
                {record.distanceMeters !== null && (
                  <span className="text-ink-500 text-xs">
                    {' '}
                    · à {formatDistanceMeters(record.distanceMeters)}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onOpen(record)}
                aria-label={`${actionLabel} : ${record.label}`}
                className="text-brand-400 border-surface-600 hover:bg-surface-800 min-h-11 shrink-0 rounded-md border px-3 text-xs"
              >
                {actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Observations associées à UN point : signes de gibier (points de repère) et
 * entrées de journal proches, chacune avec un lien. Les visites (traces) et
 * les animaux observés ne sont que résumés : ce sont des comptes séparés. */
export function AssociatedObservations({
  row,
  onClose,
}: {
  row: WaypointComparison
  onClose: () => void
}) {
  const navigate = useNavigate()
  const o = row.observations
  return (
    <Card
      className="flex flex-col gap-4 p-4"
      role="region"
      aria-label={`Observations associées à ${row.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-ink-100 text-sm font-semibold">
          Observations associées à « {row.name} »
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-500 hover:text-ink-100 min-h-11 min-w-11 text-xs"
        >
          Fermer
        </button>
      </div>
      <p className="text-ink-500 text-xs">
        À moins de {o.radiusMeters} m, tous territoires confondus. Ces comptes sont
        séparés : une visite n’est pas un signe de gibier, et un signe de gibier n’est pas
        un animal observé.
      </p>
      <RecordList
        title="Signes de gibier (points de repère)"
        items={o.gameSigns.items}
        empty="Aucun signe de gibier enregistré à proximité."
        actionLabel="Ouvrir la fiche"
        onOpen={(record) => openWaypointSheet(record.id)}
      />
      <RecordList
        title="Entrées de journal"
        items={o.journalEntries.items}
        empty="Aucune entrée de journal à proximité."
        actionLabel="Ouvrir l’entrée"
        onOpen={(record) => openJournalEntry(record.id, navigate)}
      />
      <section aria-label="Visites" className="flex flex-col gap-1">
        <h4 className="text-ink-300 text-xs font-semibold">
          Visites (traces GPS) ({o.visits.count})
        </h4>
        <p className="text-ink-500 text-xs">
          {o.visits.count === 0
            ? 'Aucune trace enregistrée ne passe à proximité.'
            : `${o.visits.count} trace(s) passent à proximité — une information sur votre présence, pas sur le gibier.`}
        </p>
      </section>
      <section aria-label="Animaux observés" className="flex flex-col gap-1">
        <h4 className="text-ink-300 text-xs font-semibold">Animaux observés</h4>
        <p className="text-ink-500 text-xs">{o.animalsObserved.reason}</p>
      </section>
    </Card>
  )
}
