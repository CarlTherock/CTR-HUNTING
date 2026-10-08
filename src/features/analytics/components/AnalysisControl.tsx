import { Activity, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { cn } from '@/utils/cn'
import { FAMILY_ORDER } from '@/utils/analysisFamilies'
import { useAnalysisStore } from '../state/analysisStore'
import { CoverageLine, FamilySection } from './AnalyzerBreakdown'
import { scoreLabel } from './analyzerFormat'

/**
 * Phase 8 — Analytics Engine. Arm, tap the map, and get an explainable
 * breakdown across 6 independent analyzers (terrain/vegetation/weather/
 * wind/time/history) for that exact point — same arm-then-tap pattern as
 * `TerrainInfoControl`. Every analyzer is a pure function
 * (`utils/analyzers.ts`) over real data (queried elevation, on-demand
 * weather/wind/vegetation fetches for that exact coordinate, and the
 * user's own local waypoints/tracks) — never a fabricated score, and a
 * missing analyzer is shown as "No data" rather than silently omitted.
 * The combined score is an indicative reference index (never a
 * probability of presence/movement/harvest), shown with the three
 * families (Habitat / Conditions / Observations) and its factor coverage.
 */
export function AnalysisControl() {
  const mode = useAnalysisStore((state) => state.mode)
  const status = useAnalysisStore((state) => state.status)
  const combined = useAnalysisStore((state) => state.combined)
  const coordinate = useAnalysisStore((state) => state.coordinate)
  const recent = useAnalysisStore((state) => state.recent)
  const startAnalyzing = useAnalysisStore((state) => state.startAnalyzing)
  const cancel = useAnalysisStore((state) => state.cancel)
  const close = useAnalysisStore((state) => state.close)
  const recall = useAnalysisStore((state) => state.recall)

  if (mode === 'analyzing') {
    return (
      <div className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg">
        Touchez la carte pour analyser cet endroit
        <button
          type="button"
          onClick={cancel}
          aria-label="Annuler l’analyse"
          className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <>
      <ToolTrigger
        label="Analyser cet endroit"
        icon={<Activity size={18} aria-hidden="true" />}
        onClick={startAnalyzing}
        order={40}
      />

      {status !== 'idle' && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div
            data-testid="spot-analysis-panel"
            className="border-surface-600 bg-surface-900 max-h-[75vh] w-full max-w-sm overflow-y-auto rounded-lg border p-4 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Analyse de l’endroit</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer l’analyse"
                className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {recent.length > 1 && (
              <div
                role="group"
                aria-label="Endroits analysés récemment"
                className="mb-3 flex gap-1.5 overflow-x-auto pb-1"
              >
                {recent.map((entry, i) => {
                  const isActive =
                    coordinate?.lat === entry.coordinate.lat &&
                    coordinate.lng === entry.coordinate.lng
                  return (
                    <button
                      key={`${entry.coordinate.lat}-${entry.coordinate.lng}-${i}`}
                      type="button"
                      onClick={() => recall(i)}
                      className={cn(
                        'shrink-0 rounded-md border px-2 py-1 text-xs pointer-coarse:min-h-11',
                        isActive
                          ? 'border-brand-500 text-brand-400'
                          : 'border-surface-700 text-ink-300',
                      )}
                    >
                      {entry.combined.overallScore !== null
                        ? `${Math.round(entry.combined.overallScore)}/100`
                        : '—'}
                      <span className="text-ink-600 ml-1">
                        {entry.coordinate.lat.toFixed(3)},
                        {entry.coordinate.lng.toFixed(3)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {status === 'loading' && (
              <p className="text-ink-500 text-sm">Analyse en cours…</p>
            )}

            {status === 'ready' && combined && (
              <>
                <div className="mb-3">
                  {combined.overallScore !== null ? (
                    <>
                      <p
                        className={cn(
                          'text-lg font-semibold',
                          combined.overallScore >= 55
                            ? 'text-status-success'
                            : combined.overallScore <= 45
                              ? 'text-status-danger'
                              : 'text-ink-100',
                        )}
                      >
                        {Math.round(combined.overallScore)}/100 —{' '}
                        {scoreLabel(combined.overallScore)}
                      </p>
                      <p className="text-ink-500 text-xs">
                        Indice de repère comparatif fondé sur les facteurs ci-dessous —
                        pas une probabilité de présence, de déplacement ni de récolte.
                        Analyse environnementale générale (aucun profil d’espèce).
                      </p>
                      {combined.coverage && (
                        <div className="mt-1">
                          <CoverageLine coverage={combined.coverage} />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-ink-500 text-sm">
                      Aucun analyseur n’avait assez de données pour cet endroit.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {FAMILY_ORDER.map((family) => (
                    <FamilySection
                      key={family}
                      family={family}
                      summary={combined.families?.find((f) => f.family === family)}
                      results={combined.results}
                    />
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
