import { useInRouterContext, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAssistantStore } from '../state/assistantStore'
import type { AssistantToolId } from '../types'
import type { TerritoryFilter } from '@/features/territories/filter'

interface Props {
  tool: AssistantToolId
  summaryScope?: TerritoryFilter
  children: ReactNode
  className?: string
  testId?: string
  ariaLabel?: string
}

function Inner({ tool, summaryScope, children, className, testId, ariaLabel }: Props) {
  const navigate = useNavigate()
  const openTool = useAssistantStore((s) => s.openTool)
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      className={
        className ??
        'border-surface-600 text-ink-100 hover:bg-surface-800 focus-visible:outline-brand-400 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm outline-none focus-visible:outline-2'
      }
      onClick={() => {
        openTool(tool, summaryScope ? { summaryScope } : undefined)
        navigate('/assistant')
      }}
    >
      {children}
    </button>
  )
}

/**
 * Raccourci vers un outil de l'assistant (« Expliquer », « Résumer »).
 * N'est affiché que dans le routeur de l'application : hors routeur
 * (composant monté seul) il ne rend rien plutôt que de planter.
 */
export function OpenAssistantButton(props: Props) {
  const inRouter = useInRouterContext()
  if (!inRouter) return null
  return <Inner {...props} />
}
