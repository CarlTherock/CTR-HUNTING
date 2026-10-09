import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EyeOff, Eye, Minus, Plus, RotateCcw, Trash2, Maximize } from 'lucide-react'
import { Button } from '@/components/ui'
import { useAddPointStore } from '@/features/addpoint/state/addPointStore'
import { lastClue, overviewView, sessionClues } from '@/features/blood/sessionLogic'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { SHOT_SPECIES_LABEL, shotEntries } from '@/features/aftershot/shotLogic'
import type { Observation, ShotSpecies } from '@/types'
import { cn } from '@/utils/cn'
import {
  buildImpact,
  impactMatchesShot,
  impactVersionStatus,
  initialZoom,
  regionAnchor,
  regionAt,
  regionById,
  withImpact,
  withoutImpact,
  zoomBy,
} from '../anatomyLogic'
import { AnatomyCanvas } from '../components/AnatomyCanvas'
import { ImpactPanel } from '../components/ImpactPanel'
import {
  ANATOMY_CONTENT_VERSION,
  ANATOMY_REVISION_DATE,
  ANATOMY_VALIDATION_LIMITS,
  NO_DELAY_NOTICE,
} from '../content/meta'
import { ILLUSTRATIONS } from '../illustrations'
import { useAnatomyDraft } from '../state/anatomyDraftStore'

const TOOL =
  'border-surface-600 bg-surface-800 text-ink-100 hover:bg-surface-700 flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg border px-2 text-sm font-medium disabled:opacity-50'

function shotLabel(entry: Observation): string {
  const species = entry.shot ? SHOT_SPECIES_LABEL[entry.shot.species] : ''
  const when = new Date(entry.timestamp).toLocaleString('fr-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${species} · ${when}${entry.shot?.impact ? ' · point enregistré' : ''}`
}

/** « Anatomie et point d'impact » — a schematic drawing on which the user marks
 * where they believe the shot hit. Nothing is computed from the point: no
 * diagnosis, no probability, no distance, no waiting time. */
export default function AnatomyPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const draft = useAnatomyDraft()
  const observations = useJournalStore((s) => s.observations)
  const journalLoaded = useJournalStore((s) => s.loaded)
  const waypoints = useWaypointsStore((s) => s.waypoints)
  const waypointsLoaded = useWaypointsStore((s) => s.loaded)
  const sessions = useBloodStore((s) => s.sessions)
  const sessionsLoaded = useBloodStore((s) => s.loaded)
  const [shotId, setShotId] = useState<string | null>(params.get('shot'))
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!journalLoaded) void useJournalStore.getState().load()
    if (!waypointsLoaded) void useWaypointsStore.getState().load()
    if (!sessionsLoaded) void useBloodStore.getState().load()
  }, [journalLoaded, waypointsLoaded, sessionsLoaded])

  const shots = useMemo(() => shotEntries(observations), [observations])
  const shot =
    shots.find((o) => o.id === shotId) ?? (shotId === null ? (shots[0] ?? null) : null)
  const ill = ILLUSTRATIONS[draft.species]
  const region = draft.point ? regionAt(ill, draft.point) : null

  // Load the saved estimate of the chosen shot once; never overwrite a draft
  // the user is editing for the same shot.
  const targetId = shot?.id ?? null
  useEffect(() => {
    if (!shot || draft.loadedShotId === shot.id) return
    const impact = shot.shot?.impact
    if (impact) {
      draft.load({
        shotId: shot.id,
        species: impact.species,
        point: { x: impact.x, y: impact.y },
        note: impact.note ?? '',
      })
    } else {
      useAnatomyDraft.setState({ loadedShotId: shot.id })
      if (!useAnatomyDraft.getState().point && shot.shot) {
        useAnatomyDraft.getState().setSpecies(shot.shot.species)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, draft.loadedShotId])

  const openSession = sessions.find((s) => s.status !== 'finished') ?? null
  const searchSession =
    openSession ?? sessions.find((s) => s.id === shot?.shot?.searchSessionId) ?? null
  const lastFound = useMemo(
    () => (searchSession ? lastClue(sessionClues(waypoints, searchSession.id)) : null),
    [searchSession, waypoints],
  )

  const saved = shot?.shot?.impact
  const olderVersion = saved
    ? impactVersionStatus(saved, ILLUSTRATIONS[saved.species]) === 'older'
    : false

  let saveHint: string | null = null
  if (!shot)
    saveHint =
      'Consignez d’abord un tir dans « Après le tir » pour y enregistrer le point.'
  else if (!draft.point) saveHint = 'Placez un point pour pouvoir l’enregistrer.'
  else if (shot.shot && !impactMatchesShot(shot.shot, ill)) {
    saveHint = `Ce tir est consigné comme ${SHOT_SPECIES_LABEL[shot.shot.species]} : choisissez le même dessin pour enregistrer.`
  }
  const canSave = shot !== null && draft.point !== null && saveHint === null

  async function save() {
    if (!shot?.shot || !draft.point || !canSave) return
    setSaving(true)
    try {
      const impact = buildImpact(ill, draft.point, draft.note, new Date().toISOString())
      await useJournalStore
        .getState()
        .update(shot.id, { shot: withImpact(shot.shot, impact) })
      useJournalStore.getState().select(null)
      setMessage(
        'Estimation manuelle enregistrée sur le tir. Vous pouvez la modifier à tout moment.',
      )
    } catch {
      setMessage(
        'L’estimation n’a pas pu être enregistrée sur cet appareil. Rien n’est perdu : réessayez.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function removeSaved() {
    if (!shot?.shot) return
    await useJournalStore.getState().update(shot.id, { shot: withoutImpact(shot.shot) })
    useJournalStore.getState().select(null)
    useAnatomyDraft.getState().setPoint(null)
    setMessage('Estimation retirée du tir. Le reste du dossier est intact.')
  }

  function chooseSpecies(species: ShotSpecies) {
    if (species === draft.species) return
    const hadPoint = draft.point !== null
    draft.setSpecies(species)
    setMessage(
      hadPoint
        ? 'Point retiré : les dessins du cerf et de l’orignal sont distincts, un point ne se transpose pas.'
        : null,
    )
  }

  function chooseShot(id: string) {
    setShotId(id)
    setMessage(null)
  }

  const dragZoom = (factor: number) => draft.setZoom(zoomBy(ill, draft.zoom, factor))

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="anatomy-page">
      <div className="anatomy-grid shrink-0">
        <div className="anatomy-head flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-ink-100 text-lg font-semibold">
              Anatomie et point d’impact
            </h1>
            <Link
              to="/after-shot"
              className="text-brand-400 min-h-11 shrink-0 content-center text-sm underline"
            >
              Après le tir
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Espèce"
              className="flex min-w-[12rem] flex-1 gap-2"
            >
              {(['deer', 'moose'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={draft.species === value}
                  onClick={() => chooseSpecies(value)}
                  className={cn(
                    'min-h-11 flex-1 rounded-lg border px-3 text-base font-semibold',
                    draft.species === value
                      ? 'border-brand-400 bg-brand-500/20 text-brand-400'
                      : 'border-surface-600 bg-surface-800 text-ink-100',
                  )}
                >
                  {SHOT_SPECIES_LABEL[value]}
                </button>
              ))}
            </div>
            {shots.length > 1 ? (
              <select
                aria-label="Tir sur lequel enregistrer"
                value={shot?.id ?? ''}
                onChange={(event) => chooseShot(event.target.value)}
                className="border-surface-600 bg-surface-800 text-ink-100 min-h-11 min-w-0 flex-1 basis-40 rounded-lg border px-2 text-sm"
              >
                {shots.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {shotLabel(entry)}
                  </option>
                ))}
              </select>
            ) : (
              <p
                className="text-ink-300 min-w-0 flex-1 basis-40 text-xs"
                data-testid="shot-target"
              >
                {shot ? `Tir : ${shotLabel(shot)}` : 'Aucun tir consigné'}
              </p>
            )}
          </div>
          {message && (
            <p
              role="status"
              className="text-ink-300 text-xs"
              data-testid="anatomy-message"
            >
              {message}
            </p>
          )}
        </div>

        <div
          data-testid="anatomy-viewer"
          className="anatomy-viewer border-surface-700 bg-surface-900 flex min-h-0 flex-col overflow-hidden rounded-lg border"
        >
          <div className="min-h-0 flex-1">
            <AnatomyCanvas
              illustration={ill}
              point={draft.point}
              onPoint={draft.setPoint}
              zoom={draft.zoom}
              onZoom={draft.setZoom}
              annotations={draft.annotations}
              highlightedRegionId={region?.id ?? null}
            />
          </div>
          <p
            className="text-ink-300 shrink-0 px-2 pb-1 text-[11px] leading-tight"
            data-testid="view-caption"
          >
            {ill.viewLabel} · point jaune : impact présumé · pointillés rouges : schéma
          </p>
        </div>

        <div
          className="anatomy-tools flex flex-wrap gap-2"
          role="toolbar"
          aria-label="Commandes du dessin"
        >
          <button
            type="button"
            className={TOOL}
            aria-label="Zoom avant"
            onClick={() => dragZoom(1.4)}
            disabled={draft.zoom.scale >= 4}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={TOOL}
            aria-label="Zoom arrière"
            onClick={() => dragZoom(1 / 1.4)}
            disabled={draft.zoom.scale <= 1}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={TOOL}
            aria-label="Réinitialiser le zoom"
            onClick={() => draft.setZoom(initialZoom(ill))}
            disabled={draft.zoom.scale === 1}
          >
            <Maximize size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={TOOL}
            aria-label={
              draft.annotations ? 'Masquer les annotations' : 'Afficher les annotations'
            }
            aria-pressed={draft.annotations}
            onClick={() => draft.setAnnotations(!draft.annotations)}
          >
            {draft.annotations ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={TOOL}
            aria-label="Réinitialiser"
            onClick={() => {
              draft.setPoint(null)
              draft.setNote('')
              draft.setZoom(initialZoom(ill))
              setMessage(null)
            }}
          >
            <RotateCcw size={18} aria-hidden="true" />
          </button>
          <select
            aria-label="Choisir une région"
            value={region?.id ?? ''}
            onChange={(event) => {
              const picked = regionById(ill, event.target.value)
              if (picked) draft.setPoint(regionAnchor(ill, picked))
            }}
            className="border-surface-600 bg-surface-800 text-ink-100 min-h-11 min-w-0 flex-1 basis-40 rounded-lg border px-2 text-sm"
          >
            <option value="">Région (sans toucher le dessin)…</option>
            {ill.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <ImpactPanel
          illustration={ill}
          region={region}
          hasPoint={draft.point !== null}
          open={draft.panelOpen}
          onToggle={() => draft.setPanelOpen(!draft.panelOpen)}
          note={draft.note}
          onNote={draft.setNote}
          onSave={() => void save()}
          saveDisabled={!canSave || saving}
          saveHint={saveHint}
          onOpenShot={() =>
            void navigate(shot ? `/after-shot?shot=${shot.id}` : '/after-shot')
          }
          onOpenClues={() => {
            useAddPointStore.getState().openSheet('blood')
            void navigate('/map')
          }}
          onOpenCamera={() => {
            useBloodStore.getState().openCamera()
            void navigate('/map')
          }}
          onLastClue={() => {
            if (!lastFound) return
            const view = overviewView([lastFound.coordinate])
            if (view) useMapStore.getState().setView(view)
            void navigate('/map')
          }}
          hasLastClue={lastFound !== null}
          className="anatomy-panel"
        />
      </div>

      {saved && (
        <div
          className="border-surface-700 bg-surface-900 flex flex-col gap-2 rounded-lg border p-3 text-xs"
          data-testid="saved-impact"
        >
          <p className="text-ink-100">
            Estimation enregistrée sur ce tir : {SHOT_SPECIES_LABEL[saved.species]},
            région{' '}
            {regionById(ILLUSTRATIONS[saved.species], saved.regionId)?.label ??
              'hors des régions dessinées'}
            , le {new Date(saved.recordedAt).toLocaleString('fr-CA')} (version du dessin :{' '}
            {saved.illustrationVersion}).
          </p>
          {olderVersion && (
            <p className="text-amber-200">
              Ce point a été placé sur une version précédente du dessin : sa position est
              conservée telle quelle, sans être déplacée.
            </p>
          )}
          <Button
            variant="secondary"
            size="md"
            className="self-start"
            onClick={() => void removeSaved()}
          >
            <Trash2 size={16} aria-hidden="true" /> Retirer l’estimation du tir
          </Button>
        </div>
      )}

      <details
        className="border-surface-700 bg-surface-900 rounded-lg border"
        data-testid="anatomy-provenance"
      >
        <summary className="text-ink-100 min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">
          Sources, version et limites
        </summary>
        <div className="text-ink-300 flex flex-col gap-2 px-3 pb-3 text-xs">
          <p>
            Version du contenu : {ANATOMY_CONTENT_VERSION} · révision du{' '}
            {ANATOMY_REVISION_DATE}.
          </p>
          <p>{ANATOMY_VALIDATION_LIMITS}</p>
          <p>{NO_DELAY_NOTICE}</p>
          <p>
            Réglementation québécoise : contenu à venir — sources officielles en
            vérification. Rien ici ne tient lieu de règle ou de conseil de sécurité.
          </p>
          <p>
            <strong>Dessin :</strong> {ill.provenance.origin}
          </p>
          <p>
            <strong>Licence :</strong> {ill.provenance.licence}
          </p>
          <p>
            <strong>Références anatomiques :</strong>{' '}
            {ill.provenance.anatomicalReferences.join(' ')}
          </p>
          <p>
            <strong>Limites de validation :</strong> {ill.provenance.validationLimits}
          </p>
          <p>
            <strong>Version du dessin :</strong> {ill.version}
          </p>
        </div>
      </details>
    </div>
  )
}
