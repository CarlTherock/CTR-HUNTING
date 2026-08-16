import { PhasePlaceholder } from '@/components/ui'

export function AnalysisPage() {
  return (
    <PhasePlaceholder
      title="Terrain Analysis"
      description="Explainable, data-driven terrain scoring."
      phase={8}
      phaseName="Analytics Engine"
      upcoming={[
        'Terrain / vegetation / weather / wind analyzers',
        'Explainable scores (never a bare number)',
        'Analysis heatmap (Phase 9)',
        'Zone comparison',
        'Points of interest detection',
        'Confidence clearly labeled — never presented as certainty',
      ]}
    />
  )
}
