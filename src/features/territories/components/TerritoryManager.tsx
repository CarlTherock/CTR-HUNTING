import { useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Check,
  FolderOpen,
  ListChecks,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { OpenAssistantButton } from '@/features/ai/components/OpenAssistantButton'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { UNCLASSIFIED_LABEL, sortTerritories } from '../filter'
import {
  MAX_TERRITORY_NAME_LENGTH,
  totalContents,
  useTerritoriesStore,
} from '../state/territoriesStore'
import { useEnsureTerritories } from '../useEnsureTerritories'
import type { Territory } from '@/types'

const ICON_BUTTON =
  'text-ink-300 hover:bg-surface-800 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-40'

const FIELD =
  'border-surface-600 bg-surface-900 text-ink-100 focus-visible:outline-brand-400 min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-base outline-none focus-visible:outline-2'

/** Stable ref callback: moves focus into the confirmation dialog when it opens. */
function focusOnMount(element: HTMLDivElement | null) {
  element?.focus()
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * Creates, renames, archives/restores and deletes territories — purely
 * logical folders (no geographic boundary). Deleting never deletes data:
 * the confirmation states how many items will move to « Non classé ».
 */
export function TerritoryManager() {
  useEnsureTerritories()
  const territories = useTerritoriesStore((state) => state.territories)
  const storeError = useTerritoriesStore((state) => state.error)
  const pendingDelete = useTerritoriesStore((state) => state.pendingDelete)
  const create = useTerritoriesStore((state) => state.create)
  const rename = useTerritoriesStore((state) => state.rename)
  const archive = useTerritoriesStore((state) => state.archive)
  const restore = useTerritoriesStore((state) => state.restore)
  const requestDelete = useTerritoriesStore((state) => state.requestDelete)
  const cancelDelete = useTerritoriesStore((state) => state.cancelDelete)
  const confirmDelete = useTerritoriesStore((state) => state.confirmDelete)

  const waypoints = useWaypointsStore((state) => state.waypoints)
  const tracks = useTracksStore((state) => state.tracks)

  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const sorted = sortTerritories(territories)
  const active = sorted.filter((t) => !t.archivedAt)
  const archived = sorted.filter((t) => t.archivedAt)

  function countsOf(territoryId: string | undefined): string {
    const known = new Set(territories.map((t) => t.id))
    const matches = (id: string | undefined) =>
      territoryId === undefined ? !id || !known.has(id) : id === territoryId
    const w = waypoints.filter((x) => matches(x.territoryId)).length
    const t = tracks.filter((x) => matches(x.territoryId)).length
    return `${plural(w, 'point de repère', 'points de repère')} · ${plural(t, 'trace', 'traces')}`
  }

  async function handleCreate() {
    setError(null)
    setNotice(null)
    const result = await create(newName)
    if (result.ok) setNewName('')
    else setError(result.error)
  }

  async function handleRename(id: string) {
    setError(null)
    const result = await rename(id, draftName)
    if (result.ok) setRenamingId(null)
    else setError(result.error)
  }

  async function handleConfirmDelete() {
    const name = pendingDelete?.name
    const moved = await confirmDelete()
    if (moved) {
      const total = totalContents(moved)
      setNotice(
        total === 0
          ? `Territoire « ${name} » supprimé.`
          : `Territoire « ${name} » supprimé : ${plural(total, 'élément déplacé', 'éléments déplacés')} vers « ${UNCLASSIFIED_LABEL} ».`,
      )
    }
  }

  function renderRow(territory: Territory) {
    const renaming = renamingId === territory.id
    const isArchived = Boolean(territory.archivedAt)
    return (
      <li key={territory.id} className="flex flex-col gap-1">
        {renaming ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              void handleRename(territory.id)
            }}
          >
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={MAX_TERRITORY_NAME_LENGTH}
              aria-label={`Nouveau nom de ${territory.name}`}
              autoFocus
              className={FIELD}
            />
            <button type="submit" aria-label="Enregistrer le nom" className={ICON_BUTTON}>
              <Check size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setRenamingId(null)}
              aria-label="Annuler le renommage"
              className={ICON_BUTTON}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-1">
            <div className="min-w-0 flex-1">
              <span className="text-ink-100 block text-sm font-medium break-words">
                {territory.name}
                {isArchived && (
                  <span className="text-ink-500 ml-2 text-xs font-normal">Archivé</span>
                )}
              </span>
              <span className="text-ink-500 block text-xs">{countsOf(territory.id)}</span>
            </div>
            <div className="flex shrink-0 items-center">
              <OpenAssistantButton
                tool="territory-summary"
                summaryScope={{ kind: 'territory', id: territory.id }}
                ariaLabel={`Résumer ${territory.name}`}
                className={ICON_BUTTON}
              >
                <ListChecks size={16} aria-hidden="true" />
              </OpenAssistantButton>
              <button
                type="button"
                onClick={() => {
                  setRenamingId(territory.id)
                  setDraftName(territory.name)
                  setError(null)
                }}
                aria-label={`Renommer ${territory.name}`}
                className={ICON_BUTTON}
              >
                <Pencil size={16} aria-hidden="true" />
              </button>
              {isArchived ? (
                <button
                  type="button"
                  onClick={() => void restore(territory.id)}
                  aria-label={`Restaurer ${territory.name}`}
                  className={ICON_BUTTON}
                >
                  <ArchiveRestore size={16} aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void archive(territory.id)}
                  aria-label={`Archiver ${territory.name}`}
                  className={ICON_BUTTON}
                >
                  <Archive size={16} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void requestDelete(territory.id)}
                aria-label={`Supprimer ${territory.name}`}
                className={`${ICON_BUTTON} hover:text-status-danger`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <Card
      role="region"
      className="flex flex-col gap-3 p-3"
      aria-label="Gestion des territoires"
    >
      <p className="text-ink-500 text-xs">
        Un territoire est un dossier pour classer vos points de repère, traces et entrées
        de journal. Il n’a pas de limites géographiques.
      </p>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void handleCreate()
        }}
      >
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={MAX_TERRITORY_NAME_LENGTH}
          placeholder="Nom du nouveau territoire"
          aria-label="Nom du nouveau territoire"
          className={FIELD}
        />
        <Button type="submit" variant="primary" size="md" className="min-h-11 shrink-0">
          Créer
        </Button>
      </form>

      {(error ?? storeError) && (
        <p role="alert" className="text-status-danger text-sm">
          {error ?? storeError}
        </p>
      )}
      {notice && (
        <p role="status" className="text-status-success text-sm">
          {notice}
        </p>
      )}

      {pendingDelete && (
        <div
          ref={focusOnMount}
          tabIndex={-1}
          role="alertdialog"
          aria-label={`Confirmer la suppression du territoire ${pendingDelete.name}`}
          className="border-status-danger/50 flex flex-col gap-2 rounded-lg border p-3 text-sm outline-none"
        >
          {totalContents(pendingDelete.contents) === 0 ? (
            <p className="text-ink-100">
              Supprimer le territoire « {pendingDelete.name} » ? Il est vide.
            </p>
          ) : (
            <>
              <p className="text-ink-100">
                Supprimer le territoire « {pendingDelete.name} » ? Il contient{' '}
                {plural(totalContents(pendingDelete.contents), 'élément', 'éléments')} (
                {plural(
                  pendingDelete.contents.waypoints,
                  'point de repère',
                  'points de repère',
                )}
                , {plural(pendingDelete.contents.tracks, 'trace', 'traces')},{' '}
                {plural(
                  pendingDelete.contents.observations,
                  'entrée de journal',
                  'entrées de journal',
                )}
                ).
              </p>
              <p className="text-ink-300">
                Ces éléments seront déplacés vers « {UNCLASSIFIED_LABEL} ». Aucun point,
                aucune trace et aucune entrée ne sera supprimé.
              </p>
            </>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="secondary"
              size="md"
              className="min-h-11"
              onClick={cancelDelete}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              size="md"
              className="min-h-11"
              onClick={() => void handleConfirmDelete()}
            >
              <Trash2 size={14} aria-hidden="true" />
              Supprimer le territoire
            </Button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {active.map(renderRow)}
        {/* Always present: it holds everything filed in no territory,
            including all data that predates territories. */}
        <li className="flex items-center gap-2" data-testid="unclassified-row">
          <FolderOpen size={16} aria-hidden="true" className="text-ink-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-ink-100 block text-sm font-medium">
              {UNCLASSIFIED_LABEL}
            </span>
            <span className="text-ink-500 block text-xs">{countsOf(undefined)}</span>
          </div>
          <OpenAssistantButton
            tool="territory-summary"
            summaryScope={{ kind: 'unclassified' }}
            ariaLabel={`Résumer ${UNCLASSIFIED_LABEL}`}
            className={`${ICON_BUTTON} ml-auto`}
          >
            <ListChecks size={16} aria-hidden="true" />
          </OpenAssistantButton>
        </li>
      </ul>

      {archived.length > 0 && (
        <div>
          <h3 className="text-ink-300 mb-1 text-xs font-semibold">Archivés</h3>
          <ul className="flex flex-col gap-2">{archived.map(renderRow)}</ul>
        </div>
      )}
    </Card>
  )
}
