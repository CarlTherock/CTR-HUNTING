import { useEffect, useMemo, useState } from 'react'
import { PawPrint, Plus } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { cn } from '@/utils/cn'
import { DeerEntryDetail } from '../components/DeerEntryDetail'
import { DeerEntryForm } from '../components/DeerEntryForm'
import { DeerFilters } from '../components/DeerFilters'
import { EMPTY_DEER_FILTERS, dayBounds, type DeerFilterState } from '../deerFilters'
import { DeerMiniMap } from '../components/DeerMiniMap'
import { DeerSummaryCard } from '../components/DeerSummaryCard'
import {
  DEER_DISCLAIMER,
  DEER_KIND_LABEL,
  filterDeerEntries,
  summarizeDeer,
  directionLabel,
} from '../deerLogic'

type View = 'list' | 'map'

/** « DeerTracker — Suivi des cerfs » : MY observations and signs of deer.
 * Built on the journal's observations (same storage, same photos, same
 * territories): an entry is a journal observation carrying a `deer` record. */
export default function DeerTrackerPage() {
  const observations = useJournalStore((s) => s.observations)
  const loaded = useJournalStore((s) => s.loaded)
  const load = useJournalStore((s) => s.load)
  const update = useJournalStore((s) => s.update)
  const territories = useTerritoriesStore((s) => s.territories)
  const territoryFilter = useTerritoriesStore((s) => s.filter)
  const tracksLoaded = useTracksStore((s) => s.loaded)
  const loadTracks = useTracksStore((s) => s.load)
  const wpLoaded = useWaypointsStore((s) => s.loaded)
  const loadWaypoints = useWaypointsStore((s) => s.load)

  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>('list')
  const [filters, setFilters] = useState<DeerFilterState>(EMPTY_DEER_FILTERS)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void load()
    if (!tracksLoaded) void loadTracks()
    if (!wpLoaded) void loadWaypoints()
  }, [loaded, load, tracksLoaded, loadTracks, wpLoaded, loadWaypoints])

  const shown = useMemo(() => {
    const from = dayBounds(filters.from)
    const to = dayBounds(filters.to)
    return filterDeerEntries(
      observations,
      {
        territory: territoryFilter,
        kinds: filters.kinds,
        ...(from ? { fromMs: from.start } : {}),
        ...(to ? { toMs: to.end } : {}),
      },
      territories,
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [observations, filters, territoryFilter, territories])

  const summary = useMemo(() => summarizeDeer(shown, territories), [shown, territories])
  const selected = shown.find((o) => o.id === selectedId) ?? null
  const allDeer = observations.filter((o) => o.deer).length

  // Journal entries that are not classified yet: the user can classify one,
  // never done automatically.
  const unclassified = observations.filter((o) => !o.deer)
  const [classifyId, setClassifyId] = useState('')

  async function classify() {
    const target = observations.find((o) => o.id === classifyId)
    if (!target) return
    await update(target.id, { deer: { kind: 'other_sign' } })
    setClassifyId('')
    setSelectedId(target.id)
    setNotice(
      'Entrée du journal classée dans DeerTracker : choisissez son type dans les détails.',
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="DeerTracker — Suivi des cerfs"
        description="Mes observations et indices de cerfs, sur cet appareil."
        actions={
          <Button
            size="lg"
            onClick={() => {
              setAdding(true)
              setSelectedId(null)
              setNotice(null)
            }}
          >
            <Plus size={18} aria-hidden="true" />
            Enregistrer une observation
          </Button>
        }
      />

      <p className="text-ink-300 border-surface-700 bg-surface-900 rounded-lg border p-3 text-sm">
        {DEER_DISCLAIMER}
      </p>

      {notice && (
        <p role="status" className="text-status-success text-sm">
          {notice}
        </p>
      )}

      {adding && (
        <DeerEntryForm
          onCancel={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false)
            setSelectedId(id)
            setNotice(
              'Observation enregistrée. Ajoutez des photos et des détails ci-dessous si vous voulez.',
            )
          }}
        />
      )}

      <DeerFilters value={filters} onChange={setFilters} />

      <DeerSummaryCard summary={summary} />

      <div role="tablist" aria-label="Affichage" className="flex gap-2">
        {(['list', 'map'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              'min-h-11 flex-1 rounded-lg border px-3 text-sm font-medium sm:flex-none',
              view === v
                ? 'border-brand-400 bg-brand-500/20 text-brand-400'
                : 'border-surface-600 bg-surface-800 text-ink-100',
            )}
          >
            {v === 'list' ? 'Liste' : 'Carte'}
          </button>
        ))}
      </div>

      {selected && (
        <DeerEntryDetail
          key={selected.id}
          entry={selected}
          onClose={() => setSelectedId(null)}
        />
      )}

      {view === 'map' && <DeerMiniMap entries={shown} onSelect={setSelectedId} />}

      {view === 'list' &&
        (shown.length === 0 ? (
          <EmptyState
            icon={<PawPrint size={28} aria-hidden="true" />}
            title={
              allDeer === 0
                ? 'Aucune observation de cerf pour le moment'
                : 'Aucune observation dans cette sélection'
            }
            description={
              allDeer === 0
                ? 'Touchez « Enregistrer une observation » pour noter un cerf vu ou un indice (piste, grattage, frottis).'
                : 'Changez les filtres (territoire, type, dates) pour les voir.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Observations">
            {shown.map((entry) => (
              <li key={entry.id}>
                <Card className="hover:bg-surface-800 transition-colors">
                  <button
                    type="button"
                    onClick={() => setSelectedId(entry.id)}
                    className="flex min-h-14 w-full flex-col items-start gap-1 p-3 text-left"
                  >
                    <span className="text-ink-100 flex flex-wrap items-center gap-2 text-sm font-medium">
                      {entry.deer && DEER_KIND_LABEL[entry.deer.kind]}
                      {entry.deer?.count !== undefined && (
                        <Badge variant="neutral">× {entry.deer.count}</Badge>
                      )}
                      {entry.deer?.name && (
                        <Badge variant="info">{entry.deer.name}</Badge>
                      )}
                    </span>
                    <span className="text-ink-500 text-xs">
                      {new Date(entry.timestamp).toLocaleString('fr-CA')}
                      {entry.positionOrigin === 'manual' && ' · position manuelle'}
                      {entry.deer?.travelDirectionDegrees !== undefined &&
                        ` · allait vers le ${directionLabel(entry.deer.travelDirectionDegrees).toLowerCase()}`}
                      {(entry.photoIds?.length ?? 0) > 0 &&
                        ` · ${entry.photoIds?.length} photo(s)`}
                    </span>
                    {entry.notes && (
                      <span className="text-ink-300 line-clamp-2 text-xs">
                        {entry.notes}
                      </span>
                    )}
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {unclassified.length > 0 && (
        <Card className="flex flex-col gap-2 p-3">
          <h2 className="text-ink-100 text-sm font-semibold">
            Classer une entrée du journal
          </h2>
          <p className="text-ink-500 text-xs">
            Vos autres entrées de journal ne sont jamais classées automatiquement.
            Choisissez-en une pour l’ajouter à DeerTracker ; elle n’est pas dupliquée.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Entrée du journal à classer"
              value={classifyId}
              onChange={(e) => setClassifyId(e.target.value)}
              className="border-surface-600 bg-surface-800 text-ink-100 min-h-11 min-w-0 flex-1 rounded-md border px-3 text-base"
            >
              <option value="">Choisir une entrée…</option>
              {unclassified
                .slice()
                .sort(
                  (a, b) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
                )
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {new Date(o.timestamp).toLocaleDateString('fr-CA')} ·{' '}
                    {o.notes.slice(0, 40) || 'Entrée sans titre'}
                  </option>
                ))}
            </select>
            <Button
              variant="secondary"
              disabled={!classifyId}
              onClick={() => void classify()}
            >
              Classer dans DeerTracker
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
