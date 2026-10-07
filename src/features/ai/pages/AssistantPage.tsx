import { PageHeader } from '@/components/ui'
import { cn } from '@/utils/cn'
import { GenerativeStatusCard } from '../components/GenerativeStatusCard'
import { ToolCompare } from '../components/ToolCompare'
import { ToolExplain } from '../components/ToolExplain'
import { ToolPeriods } from '../components/ToolPeriods'
import { ToolSearch } from '../components/ToolSearch'
import { ToolTerritory } from '../components/ToolTerritory'
import { useAssistantStore } from '../state/assistantStore'
import type { AssistantToolId } from '../types'

const TOOLS: { id: AssistantToolId; label: string }[] = [
  { id: 'territory-summary', label: 'Résumer un territoire' },
  { id: 'history-search', label: 'Rechercher l’historique' },
  { id: 'compare-periods', label: 'Comparer des périodes' },
  { id: 'explain', label: 'Expliquer une analyse' },
  { id: 'compare-caches', label: 'Comparer des caches' },
]

/**
 * Phase 14 — Assistant « utile et traçable ». Cinq outils DÉTERMINISTES
 * (calculs et résumés automatiques, faits sur l'appareil, sans réseau) et,
 * séparément, l'état honnête de l'assistant génératif : non activé.
 * Page chargée à la demande (voir `app/routes.tsx`).
 */
export function AssistantPage() {
  const tool = useAssistantStore((s) => s.tool)
  const setTool = useAssistantStore((s) => s.setTool)

  return (
    <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4">
      <PageHeader
        title="Assistant"
        description="Résumés, recherches et explications calculés sur vos données, sur l’appareil. Chaque phrase dit d’où elle vient."
      />

      <GenerativeStatusCard />

      <div
        role="tablist"
        aria-label="Outils de l’assistant"
        className="grid grid-cols-2 gap-2 min-[640px]:grid-cols-3"
      >
        {TOOLS.map((entry) => {
          const active = entry.id === tool
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`assistant-tab-${entry.id}`}
              aria-selected={active}
              aria-controls="assistant-panel"
              onClick={() => setTool(entry.id)}
              className={cn(
                'focus-visible:outline-brand-400 min-h-11 rounded-md border px-2 py-2 text-sm font-medium outline-none focus-visible:outline-2',
                active
                  ? 'border-brand-500 bg-brand-500/15 text-brand-400'
                  : 'border-surface-600 text-ink-300 hover:bg-surface-800',
              )}
            >
              {entry.label}
            </button>
          )
        })}
      </div>

      <div
        id="assistant-panel"
        role="tabpanel"
        aria-labelledby={`assistant-tab-${tool}`}
        className="min-w-0"
      >
        {tool === 'territory-summary' && <ToolTerritory />}
        {tool === 'history-search' && <ToolSearch />}
        {tool === 'compare-periods' && <ToolPeriods />}
        {tool === 'explain' && <ToolExplain />}
        {tool === 'compare-caches' && <ToolCompare />}
      </div>
    </div>
  )
}
