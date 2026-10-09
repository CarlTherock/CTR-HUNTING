import { useCallback, useEffect, useRef, useState } from 'react'
import type { Coordinate } from '@/types'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { getActiveTerritoryId } from '@/features/territories/state/territoriesStore'
import { DEFAULT_WAYPOINT_COLOR } from '@/features/waypoints/categories'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { resolveMarkerPosition } from '../markerPosition'
import { useBloodStore } from '../state/bloodStore'

/** A frame taken (or imported) in the camera. `source` says which: an imported
 * photo is NOT the live view and its place is not the photo's place. */
export interface PendingCapture {
  source: 'live' | 'import'
  original: Blob
  processed: Blob
  originalUrl: string
  processedUrl: string
}

export interface ClueRequest {
  /** `blood`: « Sang / indice » (needs a search). `normal`: ordinary waypoint. */
  kind: 'blood' | 'normal'
  note: string
  /** Attached only when the user asked for it (never automatic). */
  photo: PendingCapture | null
  /** The user chose to place the point on the map instead of using the GPS. */
  map?: boolean
}

export interface CameraClueFlow {
  busy: boolean
  error: string | null
  /** « Sang / indice » asked with no open search: the user must choose. */
  gate: boolean
  /** No usable GPS fix: the user must explicitly choose a place on the map. */
  needsMap: boolean
  /** The camera steps aside so the map can be tapped. */
  placing: boolean
  /** Placing an ordinary waypoint and its form is open on the map. */
  editorOpen: boolean
  kind: ClueRequest['kind'] | null
  hasPhoto: boolean
  submit: (request: ClueRequest) => void
  createSearchAndContinue: () => Promise<void>
  dismissGate: () => void
  chooseMap: () => void
  confirmManual: () => Promise<void>
  cancelPlacing: () => void
  reset: () => void
}

/**
 * One path for every clue made from the camera: « Confirmer un indice » (with
 * the capture) and « + Repère » (with or without it). It reuses the existing
 * engines — `addMarker` / `attachClueMedia` for « Sang / indice », the waypoint
 * draft for an ordinary repère — so locking, sessions and photos behave as
 * everywhere else. The image centre is never a position: the point is the
 * phone's GPS fix, or a place the user taps on the map.
 */
export function useCameraClue(
  gpsReading: GeolocationReading,
  onSaved: (request: ClueRequest, message: string) => void,
): CameraClueFlow {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [gate, setGate] = useState(false)
  const [needsMap, setNeedsMap] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [request, setRequest] = useState<ClueRequest | null>(null)
  const requestRef = useRef<ClueRequest | null>(null)
  // A second tap while a save is running must not create a second point.
  const inFlight = useRef(false)
  const gpsRef = useRef(gpsReading)
  const savedRef = useRef(onSaved)
  const editorOpen = useWaypointsStore((state) => state.draft !== null)

  useEffect(() => {
    gpsRef.current = gpsReading
    savedRef.current = onSaved
  }, [gpsReading, onSaved])

  const setPending = useCallback((next: ClueRequest | null) => {
    requestRef.current = next
    setRequest(next)
  }, [])

  const reset = useCallback(() => {
    setPending(null)
    setGate(false)
    setNeedsMap(false)
    setPlacing(false)
    setError(null)
  }, [setPending])

  const finish = useCallback(
    (done: ClueRequest, message: string) => {
      setPending(null)
      setGate(false)
      setNeedsMap(false)
      setPlacing(false)
      savedRef.current(done, message)
    },
    [setPending],
  )

  const attach = useCallback(
    async (
      done: ClueRequest,
      waypointId: string,
      coordinate: Coordinate | undefined,
      existingNotes = '',
    ): Promise<boolean> => {
      // The camera note is ADDED to what the waypoint already holds (the map's
      // own form may have filled `notes`): it never replaces it.
      const extra = done.note.trim()
      const note = extra ? [existingNotes.trim(), extra].filter(Boolean).join('\n') : ''
      if (!done.photo && !note) return true
      return useBloodStore.getState().attachClueMedia(waypointId, {
        note,
        photo: done.photo
          ? { processed: done.photo.processed, original: done.photo.original, coordinate }
          : undefined,
      })
    },
    [],
  )

  const persist = useCallback(
    async (done: ClueRequest, coordinate: Coordinate, origin: 'gps' | 'manual') => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy(true)
      setError(null)
      try {
        const photoCoordinate = origin === 'gps' ? coordinate : undefined
        if (done.kind === 'blood') {
          const result = await useBloodStore
            .getState()
            .addMarker('blood', { coordinate, origin })
          if (!result.ok) {
            setError(result.message)
            return
          }
          useBloodStore.setState({ manual: null })
          const attached = await attach(done, result.waypoint.id, photoCoordinate)
          finish(
            done,
            attached
              ? `${result.waypoint.name} enregistré${done.photo ? ' avec la photo' : ''}.`
              : `${result.waypoint.name} enregistré, mais la photo ou la note n’a pas pu être ajoutée.`,
          )
          return
        }
        const waypoints = useWaypointsStore.getState()
        waypoints.startDraftAt(coordinate)
        const saved = await useWaypointsStore.getState().saveDraft({
          name: '',
          category: 'general',
          color: DEFAULT_WAYPOINT_COLOR,
          notes: '',
          optimalWindDirections: [],
          territoryId: getActiveTerritoryId(),
        })
        if (!saved) {
          useWaypointsStore.getState().cancelDraft()
          setError('Le repère n’a pas pu être enregistré. Rien n’a été créé : réessayez.')
          return
        }
        const created = useWaypointsStore.getState().waypoints.at(-1)
        const attached = created ? await attach(done, created.id, photoCoordinate) : false
        finish(
          done,
          attached
            ? `${created?.name ?? 'Repère'} enregistré${done.photo ? ' avec la photo' : ''}.`
            : `${created?.name ?? 'Repère'} enregistré, mais la photo ou la note n’a pas pu être ajoutée.`,
        )
      } finally {
        inFlight.current = false
        setBusy(false)
      }
    },
    [attach, finish],
  )

  const beginPlacing = useCallback((pending: ClueRequest) => {
    setNeedsMap(false)
    if (pending.kind === 'blood') useBloodStore.getState().startManual('blood')
    else useWaypointsStore.getState().startPlacing()
    setPlacing(true)
  }, [])

  const submit = useCallback(
    (next: ClueRequest) => {
      if (inFlight.current) return
      setError(null)
      setPending(next)
      if (next.kind === 'blood' && !useBloodStore.getState().openSession()) {
        setGate(true)
        return
      }
      if (next.map) {
        beginPlacing(next)
        return
      }
      const position = resolveMarkerPosition(gpsRef.current, Date.now())
      if (position.kind === 'ready') {
        void persist(next, position.coordinate, 'gps')
        return
      }
      // No usable position: never guessed. The user is told and chooses.
      setNeedsMap(true)
    },
    [persist, setPending, beginPlacing],
  )

  const createSearchAndContinue = useCallback(async () => {
    const pending = requestRef.current
    if (!pending || inFlight.current) return
    setBusy(true)
    setError(null)
    const position = resolveMarkerPosition(gpsRef.current, Date.now())
    // Explicit choice made on screen: this also starts the red track (or
    // waits for a usable GPS fix, which the engine announces).
    const started = await useBloodStore
      .getState()
      .startSession({ hasUsableFix: position.kind === 'ready' })
    setBusy(false)
    if (!started.ok) {
      setError(started.message)
      return
    }
    setGate(false)
    submit(pending)
  }, [submit])

  const chooseMap = useCallback(() => {
    const pending = requestRef.current
    if (pending) beginPlacing(pending)
  }, [beginPlacing])

  const confirmManual = useCallback(async () => {
    const pending = requestRef.current
    const coordinate = useBloodStore.getState().manual?.coordinate
    if (!pending || pending.kind !== 'blood' || !coordinate) return
    await persist(pending, coordinate, 'manual')
  }, [persist])

  const cancelPlacing = useCallback(() => {
    if (requestRef.current?.kind === 'blood') useBloodStore.getState().cancelManual()
    else {
      useWaypointsStore.getState().cancelPlacing()
      useWaypointsStore.getState().cancelDraft()
    }
    setPlacing(false)
    setNeedsMap(true)
  }, [])

  // Ordinary repère placed on the map: the map's own form saves it; the camera
  // only waits, then adds its note (after the form's own notes) and the photo
  // (if asked) and takes over again. Cancelling the placement saves nothing and
  // leaves the camera note as typed.
  useEffect(() => {
    if (!placing || request?.kind !== 'normal') return
    const pending = request
    let sawDraft = false
    let baseline = useWaypointsStore.getState().waypoints.length
    const stop = useWaypointsStore.subscribe((state) => {
      if (state.draft) sawDraft = true
      if (state.waypoints.length > baseline) {
        baseline = state.waypoints.length
        const created = state.waypoints[state.waypoints.length - 1]
        stop()
        if (!created) return
        void attach(pending, created.id, undefined, created.notes).then((attached) =>
          finish(
            pending,
            attached
              ? `${created.name} enregistré${pending.photo ? ' avec la photo' : ''}.`
              : `${created.name} enregistré, mais la photo ou la note n’a pas pu être ajoutée.`,
          ),
        )
        return
      }
      if (sawDraft && !state.draft && !state.isPlacing && state.editingId === null) {
        stop()
        setPlacing(false)
        setNeedsMap(true)
      }
    })
    return stop
  }, [placing, request, attach, finish])

  return {
    busy,
    error,
    gate,
    needsMap,
    placing,
    editorOpen,
    kind: request?.kind ?? null,
    hasPhoto: !!request?.photo,
    submit,
    createSearchAndContinue,
    dismissGate: () => {
      setGate(false)
      setPending(null)
    },
    chooseMap,
    confirmManual,
    cancelPlacing,
    reset,
  }
}
