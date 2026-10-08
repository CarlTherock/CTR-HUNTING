import { create } from 'zustand'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { isUsableForStart } from '@/features/blood/markerPosition'
import { BLOOD_MARKER_LABEL } from '@/features/blood/sessionLogic'
import { useJournalStore } from '@/features/journal/state/journalStore'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { BloodMarkerKind, Coordinate } from '@/types'
import {
  EMPTY_ANIMAL_DRAFT,
  buildAnimalObservation,
  describeGps,
  type AddPointType,
  type AnimalDraft,
  type PositionMode,
} from '../addPointLogic'

interface AddPointState {
  open: boolean
  /** Kept when the sheet is closed and reopened, and when the type changes:
   * nothing typed is lost by switching between types. */
  type: AddPointType
  mode: PositionMode
  bloodKind: BloodMarkerKind
  note: string
  animal: AnimalDraft
  /** An animal observation waits for a tap on the map. */
  picking: { species: 'deer' | 'moose' } | null
  /** Point already chosen by a long press on the map (mode `map`). */
  pressed: Coordinate | null
  /** Blood clue requested but no search is open: the user chooses. */
  needsSearch: boolean
  error: string | null
  notice: string | null

  openSheet: (type?: AddPointType) => void
  /** Long press on the map: same panel, position = the pressed point. */
  openSheetAt: (coordinate: Coordinate) => void
  closeSheet: () => void
  setType: (type: AddPointType) => void
  setMode: (mode: PositionMode) => void
  setBloodKind: (kind: BloodMarkerKind) => void
  setNote: (note: string) => void
  patchAnimal: (patch: Partial<AnimalDraft>) => void
  cancelPicking: () => void
  clearNotice: () => void
  /** Runs the action of the selected type. `reading` is the live GPS. */
  submit: (reading: GeolocationReading) => Promise<void>
  /** Explicit user choice: create a search (starts the red trace when GPS is
   * ready), then record the clue. */
  createSearchAndSubmit: (reading: GeolocationReading) => Promise<void>
  dismissGate: () => void
  /** The map was tapped while an animal observation was waiting for a place. */
  completePicking: (coordinate: Coordinate) => Promise<void>
}

async function saveAnimal(
  species: 'deer' | 'moose',
  draft: AnimalDraft,
  note: string,
  coordinate: Coordinate,
  origin: 'gps' | 'manual',
): Promise<void> {
  const built = buildAnimalObservation(species, {
    ...draft,
    notes: [draft.notes, note].filter((part) => part.trim()).join('\n'),
  })
  await useJournalStore.getState().create({
    coordinate,
    notes: built.notes,
    positionOrigin: origin,
    ...(built.deer ? { deer: built.deer } : {}),
    ...(built.species ? { species: built.species } : {}),
  })
  // The map keeps its own state; the entry stays available in the journal.
  useJournalStore.getState().select(null)
}

export const useAddPointStore = create<AddPointState>((set, get) => ({
  open: false,
  type: 'normal',
  mode: 'gps',
  bloodKind: 'blood',
  note: '',
  animal: EMPTY_ANIMAL_DRAFT,
  picking: null,
  pressed: null,
  needsSearch: false,
  error: null,
  notice: null,

  openSheet: (type) =>
    set((state) => ({
      open: true,
      type: type ?? state.type,
      pressed: null,
      error: null,
      needsSearch: false,
      notice: null,
    })),
  openSheetAt: (coordinate) =>
    set({
      open: true,
      mode: 'map',
      pressed: coordinate,
      error: null,
      needsSearch: false,
      notice: null,
    }),
  closeSheet: () => set({ open: false, needsSearch: false, error: null }),
  setType: (type) => set({ type, error: null, needsSearch: false }),
  setMode: (mode) => set({ mode, error: null }),
  setBloodKind: (bloodKind) => set({ bloodKind }),
  setNote: (note) => set({ note }),
  patchAnimal: (patch) => set((state) => ({ animal: { ...state.animal, ...patch } })),
  cancelPicking: () => set({ picking: null }),
  clearNotice: () => set({ notice: null }),
  dismissGate: () => set({ needsSearch: false }),

  submit: async (reading) => {
    const { type, mode, bloodKind, note, animal, pressed } = get()
    const gps = describeGps(reading, Date.now())
    set({ error: null })

    if (type === 'camera') {
      useBloodStore.getState().openCamera()
      set({ open: false })
      return
    }

    if (mode === 'gps' && !gps.usable) {
      set({
        error: `${gps.line}. Choisissez « Position sur la carte » ou attendez un signal GPS.`,
      })
      return
    }
    // GPS mode: the live fix. Map mode: the point pressed on the map, if any;
    // otherwise the user is asked to tap the map (below).
    const coordinate = mode === 'gps' ? gps.coordinate : pressed
    const origin = mode === 'gps' ? 'gps' : 'manual'

    if (type === 'normal') {
      if (coordinate) {
        useWaypointsStore.getState().startDraftAt(coordinate)
      } else {
        useWaypointsStore.getState().startPlacing()
      }
      set({ open: false })
      return
    }

    if (type === 'blood') {
      const blood = useBloodStore.getState()
      if (!blood.openSession()) {
        set({ needsSearch: true })
        return
      }
      if (!coordinate) {
        blood.startManual(bloodKind, note)
        set({ open: false, note: '' })
        return
      }
      const result = await blood.addMarker(bloodKind, { coordinate, origin })
      if (!result.ok) {
        set({ error: result.message })
        return
      }
      if (note.trim()) await blood.attachClueMedia(result.waypoint.id, { note })
      set({
        open: false,
        note: '',
        notice: `${result.waypoint.name} enregistré (${BLOOD_MARKER_LABEL[bloodKind]}${origin === 'gps' && gps.lowAccuracy ? ', précision faible' : ''}${origin === 'manual' ? ', placé à la main' : ''}).`,
      })
      return
    }

    // deer / moose
    if (!coordinate) {
      set({ open: false, picking: { species: type } })
      return
    }
    try {
      await saveAnimal(type, animal, note, coordinate, origin)
    } catch {
      set({
        error: 'L’observation n’a pas pu être enregistrée. Rien n’est perdu : réessayez.',
      })
      return
    }
    set({
      open: false,
      note: '',
      animal: EMPTY_ANIMAL_DRAFT,
      notice: `Observation ${type === 'deer' ? 'cerf' : 'orignal'} enregistrée${origin === 'manual' ? ' (placée à la main)' : ''}.`,
    })
  },

  createSearchAndSubmit: async (reading) => {
    const result = await useBloodStore.getState().startSession({
      hasUsableFix: isUsableForStart(reading, Date.now()),
    })
    if (!result.ok) {
      set({ needsSearch: false, error: result.message })
      return
    }
    set({ needsSearch: false })
    await get().submit(reading)
  },

  completePicking: async (coordinate) => {
    const { picking, animal, note } = get()
    if (!picking) return
    // Cleared first: a second event from the same tap cannot save twice.
    set({ picking: null })
    try {
      await saveAnimal(picking.species, animal, note, coordinate, 'manual')
    } catch {
      set({
        picking,
        notice:
          'L’observation n’a pas pu être enregistrée. Touchez la carte pour réessayer.',
      })
      return
    }
    set({
      note: '',
      animal: EMPTY_ANIMAL_DRAFT,
      notice: `Observation ${picking.species === 'deer' ? 'cerf' : 'orignal'} enregistrée (placée à la main).`,
    })
  },
}))
