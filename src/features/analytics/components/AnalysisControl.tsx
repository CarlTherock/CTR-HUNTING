import { useState } from 'react'
import { Activity, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAnalysisStore } from '../state/analysisStore'
import type { AnalyzerResult } from '@/types'

const ANALYZER_LABEL: Record<AnalyzerResult['analyzer'], string> = {
  terrain: 'Terrain',
  vegetation: 'Vegetation',
  weather: 'Weather',
  wind: 'Wind',
  time: 'Time',
  history: 'History',
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Favorable'
  if (score >= 55) return 'Somewhat favorable'
  if (score >= 45) return 'Neutral'
  if (score >= 25) return 'Somewhat unfavorable'
  return 'Unfavorable'
}

function AnalyzerCard({ result }: { result: AnalyzerResult }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-surface-700 rounded-md border p-2.5">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={expanded}
      >
        <span className="text-ink-100 text-sm font-medium">{ANALYZER_LABEL[result.analyzer]}</span>
        <span className="flex items-center gap-2">
          {result.score !== null ? (
            <span className="text-ink-300 text-xs">{Math.round(result.score)}/100</span>
          ) : (
            <span className="text-ink-500 text-xs">No data</span>
          )}
          {expanded ? (
            <ChevronUp size={14} className="text-ink-500" aria-hidden="true" />
          ) : (
            <ChevronDown size={14} className="text-ink-500" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5">
          {result.score === null ? (
            <p className="text-ink-500 text-xs">{result.unavailableReason}</p>
          ) : (
            result.factors.map((factor, i) => (
              <div key={i} className="text-xs">
                <p className="text-ink-200 font-medium">
                  {factor.label}
                  <span className="text-ink-600 ml-1 font-normal">({factor.confidence.replace('_', ' ')})</span>
                </p>
                <p className="text-ink-500">{factor.explanation}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Phase 8 — Analytics Engine. Arm, tap the map, and get an explainable
 * breakdown across 6 independent analyzers (terrain/vegetation/weather/
 * wind/time/history) for that exact point — same arm-then-tap pattern as
 * `TerrainInfoControl`. Every analyzer is a pure function
 * (`utils/analyzers.ts`) over real data (queried elevation, on-demand
 * weather/wind/vegetation fetches for that exact coordinate, and the
 * user's own local waypoints/tracks) — never a fabricated score, and a
 * missing analyzer is shown as "No data" rather than silently omitted.
 * The combined score is explicitly framed as a probabilistic read, not a
 * certainty, per the phase's own rule.
 */
export function AnalysisControl() {
  const mode = useAnalysisStore((state) => state.mode)
  const status = useAnalysisStore((state) => state.status)
  const combined = useAnalysisStore((state) => state.combined)
  const startAnalyzing = useAnalysisStore((state) => state.startAnalyzing)
  const cancel = useAnalysisStore((state) => state.cancel)
  const close = useAnalysisStore((state) => state.close)

  if (mode === 'analyzing') {
    return (
      <div className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg">
        Tap the map to analyze that spot
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel analysis"
          className="text-ink-500 hover:text-ink-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={startAnalyzing}
        title="Analyze this spot"
        aria-label="Analyze this spot"
        className="border-surface-600 bg-surface-900/90 text-brand-400 hover:bg-surface-800 absolute top-[38.5rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors"
      >
        <Activity size={18} aria-hidden="true" />
      </button>

      {status !== 'idle' && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div
            data-testid="spot-analysis-panel"
            className="border-surface-600 bg-surface-900 max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-lg border p-4 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Spot analysis</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close analysis"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {status === 'loading' && <p className="text-ink-500 text-sm">Analyzing…</p>}

            {status === 'ready' && combined && (
              <>
                <div className="mb-3">
                  {combined.overallScore !== null ? (
                    <>
                      <p
                        className={cn(
                          'text-lg font-semibold',
                          combined.overallScore >= 55 ? 'text-status-success' : combined.overallScore <= 45 ? 'text-status-danger' : 'text-ink-100',
                        )}
                      >
                        {Math.round(combined.overallScore)}/100 — {scoreLabel(combined.overallScore)}
                      </p>
                      <p className="text-ink-500 text-xs">
                        A probabilistic read from the factors below, not a guarantee — expand each
                        analyzer to see exactly why.
                      </p>
                    </>
                  ) : (
                    <p className="text-ink-500 text-sm">No analyzers had enough data for this spot.</p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {combined.results.map((result) => (
                    <AnalyzerCard key={result.analyzer} result={result} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
