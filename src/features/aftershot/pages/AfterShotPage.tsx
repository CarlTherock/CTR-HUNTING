import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  ClipboardList,
  Droplets,
  Eye,
  Map as MapIcon,
  Play,
  Target,
} from 'lucide-react'
import { Button, Card, PageHeader } from '@/components/ui'
import { useAddPointStore } from '@/features/addpoint/state/addPointStore'
import { isUsableForStart } from '@/features/blood/markerPosition'
import { lastClue, overviewView, sessionClues } from '@/features/blood/sessionLogic'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { DeerMiniMap } from '@/features/deertracker/components/DeerMiniMap'
import { directionLabel } from '@/features/deertracker/deerLogic'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { JournalPhotos } from '@/features/journal/components/JournalPhotos'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { Observation, ShotSpecies } from '@/types'
import { cn } from '@/utils/cn'
import { ShotForm } from '../components/ShotForm'
import {
  AFTERSHOT_DISCLAIMER,
  SHOT_SPECIES_LABEL,
  buildTimeline,
  shotEntries,
  shotMarkers,
} from '../shotLogic'

const ACTION =
  'flex min-h-14 w-full items-center gap-3 rounded-lg border border-surface-600 bg-surface-800 px-3 text-left text-sm font-medium text-ink-100 hover:bg-surface-700 disabled:opacity-50'

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('fr-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** « Après le tir » — records what the user observed after a shot and gets
 * them back to the search. It is NOT the DeerTracker journal (observations of
 * deer in general): it holds shots, the clues found afterwards, and the way
 * back to the blood search and the blood camera. */
export default function AfterShotPage() {
  const navigate = useNavigate()
  const gps = useGeolocation()
  const observations = useJournalStore((s) => s.observations)
  const journalLoaded = useJournalStore((s) => s.loaded)
  const waypoints = useWaypointsStore((s) => s.waypoints)
  const waypointsLoaded = useWaypointsStore((s) => s.loaded)
  const sessions = useBloodStore((s) => s.sessions)
  const sessionsLoaded = useBloodStore((s) => s.loaded)
  const openSession = sessions.find((s) => s.status !== 'finished') ?? null

  const [species, setSpecies] = useState<ShotSpecies>('deer')
  const [adding, setAdding] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!journalLoaded) void useJournalStore.getState().load()
    if (!waypointsLoaded) void useWaypointsStore.getState().load()
    if (!sessionsLoaded) void useBloodStore.getState().load()
  }, [journalLoaded, waypointsLoaded, sessionsLoaded])

  const shots = useMemo(() => shotEntries(observations), [observations])
  const selected = shots.find((o) => o.id === selectedId) ?? shots[0] ?? null
  const searchOf = (entry: Observation) =>
    sessions.find((s) => s.id === entry.shot?.searchSessionId) ?? null

  // The last clue of the open search, else of the selected shot's search.
  const lastSession = openSession ?? (selected ? searchOf(selected) : null)
  const lastFound = useMemo(
    () => (lastSession ? lastClue(sessionClues(waypoints, lastSession.id)) : null),
    [lastSession, waypoints],
  )

  async function startOrResume() {
    setMessage(null)
    if (openSession) {
      void navigate('/map')
      return
    }
    const result = await useBloodStore.getState().startSession({
      species: SHOT_SPECIES_LABEL[species],
      hasUsableFix: isUsableForStart(gps, Date.now()),
    })
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    // The shot being worked on follows its search.
    if (selected?.shot && !selected.shot.searchSessionId) {
      await useJournalStore.getState().update(selected.id, {
        shot: { ...selected.shot, searchSessionId: result.session.id },
      })
      useJournalStore.getState().select(null)
    }
    void navigate('/map')
  }

  async function attachToOpenSearch(entry: Observation) {
    if (!entry.shot || !openSession) return
    await useJournalStore
      .getState()
      .update(entry.id, { shot: { ...entry.shot, searchSessionId: openSession.id } })
    useJournalStore.getState().select(null)
    setMessage('Tir rattaché à la recherche ouverte.')
  }

  function showOnMap(coordinates: { lat: number; lng: number }[]) {
    const view = overviewView(coordinates)
    if (view) useMapStore.getState().setView(view)
    void navigate('/map')
  }

  function recordClues() {
    useAddPointStore.getState().openSheet('blood')
    void navigate('/map')
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Après le tir"
        description="Consigner le tir et les indices, puis reprendre la recherche sur la carte."
      />
      <p className="text-ink-300 border-surface-700 bg-surface-900 rounded-lg border p-3 text-sm">
        {AFTERSHOT_DISCLAIMER}
      </p>
      <p className="text-ink-500 text-xs">
        Le journal d’observations de cerfs reste dans DeerTracker : cet espace est
        distinct.
      </p>

      <div role="radiogroup" aria-label="Espèce" className="flex gap-2">
        {(['deer', 'moose'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={species === value}
            onClick={() => setSpecies(value)}
            className={cn(
              'min-h-12 flex-1 rounded-lg border px-4 text-base font-semibold',
              species === value
                ? 'border-brand-400 bg-brand-500/20 text-brand-400'
                : 'border-surface-600 bg-surface-800 text-ink-100',
            )}
          >
            {SHOT_SPECIES_LABEL[value]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className={ACTION} onClick={() => setAdding((v) => !v)}>
          <Target size={20} aria-hidden="true" /> Consigner le tir
        </button>
        <button type="button" className={ACTION} onClick={recordClues}>
          <ClipboardList size={20} aria-hidden="true" /> Consigner les indices
        </button>
        <button type="button" className={ACTION} onClick={() => void startOrResume()}>
          {openSession ? (
            <Play size={20} aria-hidden="true" />
          ) : (
            <Droplets size={20} aria-hidden="true" />
          )}
          {openSession ? 'Reprendre la recherche en cours' : 'Démarrer une recherche'}
        </button>
        <button
          type="button"
          className={ACTION}
          onClick={() => {
            useBloodStore.getState().openCamera()
            void navigate('/map')
          }}
        >
          <Camera size={20} aria-hidden="true" /> Caméra sang (expérimentale)
        </button>
      </div>
      {!openSession && (
        <p className="text-ink-500 text-xs">
          « Démarrer une recherche » ouvre la carte et enregistre la trace rouge si le GPS
          est prêt ; rien ne démarre sans ce bouton.
        </p>
      )}
      {message && (
        <p role="status" className="text-ink-300 text-sm">
          {message}
        </p>
      )}

      {adding && (
        <ShotForm
          species={species}
          openSessionId={openSession?.id ?? null}
          onCancel={() => setAdding(false)}
          onSaved={(id) => {
            setAdding(false)
            setSelectedId(id)
            setMessage('Tir enregistré. Ajoutez des photos ci-dessous si vous voulez.')
          }}
        />
      )}

      <Card className="flex flex-col gap-2 p-3 text-sm" data-testid="last-clue">
        <h2 className="text-ink-100 flex items-center gap-2 font-semibold">
          <Eye size={16} aria-hidden="true" /> Dernier indice
        </h2>
        {lastFound ? (
          <>
            <p className="text-ink-100">
              {lastFound.name} · {timeLabel(lastFound.createdAt)}
              {lastFound.origin === 'manual' ? ' · placé à la main' : ''}
              {lastFound.coordinate.accuracyMeters !== undefined
                ? ` · ±${Math.round(lastFound.coordinate.accuracyMeters)} m`
                : ''}
            </p>
            <Button
              variant="secondary"
              size="md"
              className="self-start"
              onClick={() => showOnMap([lastFound.coordinate])}
            >
              <MapIcon size={16} aria-hidden="true" /> Voir sur la carte
            </Button>
          </>
        ) : (
          <p className="text-ink-300">
            Aucun indice enregistré pour le moment. Ils apparaissent ici dès qu’un indice
            est ajouté à une recherche.
          </p>
        )}
      </Card>

      <section aria-label="Tirs consignés" className="flex flex-col gap-2">
        <h2 className="text-ink-300 text-sm font-semibold">
          Tirs consignés ({shots.length})
        </h2>
        {shots.length === 0 && (
          <Card className="text-ink-300 p-3 text-sm">
            Aucun tir consigné. « Consigner le tir » enregistre l’heure, la position, ce
            que vous avez observé et vos estimations manuelles.
          </Card>
        )}
        {shots.map((entry) => {
          const shot = entry.shot
          if (!shot) return null
          const session = searchOf(entry)
          const clues = session ? sessionClues(waypoints, session.id) : []
          const timeline = buildTimeline(entry, clues)
          const isSelected = selected?.id === entry.id
          return (
            <Card key={entry.id} className="flex flex-col gap-2 p-3 text-sm">
              <button
                type="button"
                aria-expanded={isSelected}
                onClick={() => setSelectedId(isSelected ? '' : entry.id)}
                className="text-ink-100 flex min-h-11 items-center justify-between text-left font-semibold"
              >
                <span>
                  {SHOT_SPECIES_LABEL[shot.species]} · {timeLabel(entry.timestamp)}
                </span>
                <span className="text-ink-500 text-xs font-normal">
                  {session ? `Recherche : ${session.name}` : 'Sans recherche'}
                </span>
              </button>
              {isSelected && (
                <div className="flex flex-col gap-3">
                  <ul className="text-ink-300 flex flex-col gap-1 text-xs">
                    <li>
                      Position du tir :{' '}
                      {entry.positionOrigin === 'manual'
                        ? 'placée à la main'
                        : `GPS${entry.coordinate.accuracyMeters !== undefined ? ` ±${Math.round(entry.coordinate.accuracyMeters)} m` : ''}`}
                    </li>
                    {shot.reaction && <li>Réaction observée : {shot.reaction}</li>}
                    {shot.fleeDirectionDegrees !== undefined && (
                      <li>
                        Direction de fuite observée : vers le{' '}
                        {directionLabel(shot.fleeDirectionDegrees).toLowerCase()}
                      </li>
                    )}
                    {shot.estimatedAnimalPosition && (
                      <li>
                        Position estimée de l’animal : estimation manuelle (vous l’avez
                        saisie)
                      </li>
                    )}
                    {shot.lastConfirmedPosition && (
                      <li>Dernière position confirmée : renseignée</li>
                    )}
                    {entry.notes && <li>Notes : {entry.notes}</li>}
                  </ul>

                  <ol
                    aria-label="Chronologie"
                    className="text-ink-300 flex flex-col gap-1 text-xs"
                  >
                    {timeline.map((item) => (
                      <li key={item.id}>
                        {new Date(item.atMs).toLocaleTimeString('fr-CA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        — {item.label}
                        {item.origin === 'manual' ? ' (placé à la main)' : ''}
                      </li>
                    ))}
                  </ol>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() => setShowMap((v) => (isSelected ? !v : true))}
                    >
                      <MapIcon size={16} aria-hidden="true" />
                      {showMap ? 'Masquer la carte' : 'Voir sur la carte'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="md"
                      onClick={() =>
                        showOnMap([entry.coordinate, ...clues.map((c) => c.coordinate)])
                      }
                    >
                      Ouvrir sur la grande carte
                    </Button>
                    {!shot.searchSessionId && openSession && (
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => void attachToOpenSearch(entry)}
                      >
                        Rattacher à la recherche ouverte
                      </Button>
                    )}
                  </div>
                  {showMap && (
                    <DeerMiniMap
                      markers={shotMarkers(entry)}
                      label="Carte du tir"
                      caption="Le tir, la dernière position confirmée et l’estimation manuelle que vous avez saisis. Ce n’est pas la position de l’animal."
                      onSelect={() => undefined}
                    />
                  )}
                  <JournalPhotos
                    observationId={entry.id}
                    photoIds={entry.photoIds ?? []}
                  />
                </div>
              )}
            </Card>
          )
        })}
      </section>
    </div>
  )
}
