import { create } from 'zustand'
import { ALL_TERRITORIES } from '@/features/territories/filter'
import type { TerritoryFilter } from '@/features/territories/filter'
import { NO_CONSENT } from '../provider'
import type { TransmissionConsent } from '../provider'
import type { AssistantToolId } from '../types'

export const DEFAULT_TOOL: AssistantToolId = 'territory-summary'

interface AssistantState {
  tool: AssistantToolId
  /** Portée du résumé de territoire (indépendante du filtre des listes). */
  summaryScope: TerritoryFilter
  /** Consentement de transmission : JAMAIS conservé entre deux sessions et
   * remis à zéro à chaque changement d'outil. Tout est décoché par défaut. */
  consent: TransmissionConsent

  setTool: (tool: AssistantToolId) => void
  setSummaryScope: (scope: TerritoryFilter) => void
  /** Ouvre l'assistant sur un outil (depuis la fiche de cellule, le
   * gestionnaire de territoires…). */
  openTool: (tool: AssistantToolId, options?: { summaryScope?: TerritoryFilter }) => void
  setConsent: (patch: Partial<TransmissionConsent>) => void
  resetConsent: () => void
}

export const useAssistantStore = create<AssistantState>((set) => ({
  tool: DEFAULT_TOOL,
  summaryScope: ALL_TERRITORIES,
  consent: NO_CONSENT,

  setTool: (tool) => set({ tool, consent: NO_CONSENT }),
  setSummaryScope: (summaryScope) => set({ summaryScope }),
  openTool: (tool, options) =>
    set((state) => ({
      tool,
      consent: NO_CONSENT,
      summaryScope: options?.summaryScope ?? state.summaryScope,
    })),
  setConsent: (patch) =>
    set((state) => {
      const next = { ...state.consent, ...patch }
      // Retirer une catégorie retire aussi l'autorisation globale : il faut
      // relire l'aperçu mis à jour avant d'autoriser.
      const categoryChanged =
        patch.coordinates !== undefined ||
        patch.notes !== undefined ||
        patch.photos !== undefined
      return {
        consent:
          categoryChanged && patch.acknowledged === undefined
            ? { ...next, acknowledged: false }
            : next,
      }
    }),
  resetConsent: () => set({ consent: NO_CONSENT }),
}))
