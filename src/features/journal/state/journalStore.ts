import { create } from 'zustand'
import {
  createObservation,
  deleteObservation,
  listObservations,
  updateObservation,
} from '@/database/observationsRepository'
import type { CreateObservationInput, UpdateObservationInput } from '@/database/observationsRepository'
import type { Observation } from '@/types'

interface JournalState {
  observations: Observation[]
  loaded: boolean
  /** Entry currently open for editing/viewing, if any. */
  editingId: string | null

  load: () => Promise<void>
  create: (input: CreateObservationInput) => Promise<Observation>
  update: (id: string, patch: UpdateObservationInput) => Promise<void>
  remove: (id: string) => Promise<void>
  select: (id: string | null) => void
}

export const useJournalStore = create<JournalState>((set) => ({
  observations: [],
  loaded: false,
  editingId: null,

  load: async () => {
    const observations = await listObservations()
    set({ observations, loaded: true })
  },

  create: async (input) => {
    const observation = await createObservation(input)
    set((state) => ({ observations: [...state.observations, observation], editingId: observation.id }))
    return observation
  },

  update: async (id, patch) => {
    await updateObservation(id, patch)
    set((state) => ({
      observations: state.observations.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }))
  },

  remove: async (id) => {
    await deleteObservation(id)
    set((state) => ({
      observations: state.observations.filter((o) => o.id !== id),
      editingId: state.editingId === id ? null : state.editingId,
    }))
  },

  select: (id) => set({ editingId: id }),
}))
