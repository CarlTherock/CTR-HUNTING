import { PhasePlaceholder } from '@/components/ui'

/** Phase 8's 6 analyzers (terrain/vegetation/weather/wind/time/history)
 * are live — see `utils/analyzers.ts` — but reachable today only as a
 * point tool from the Map page ("Analyze this spot" button), since that
 * page is the one holding a live `MapInstance` for real elevation
 * queries. This page is reserved for Phase 9's heatmap/zone view, which
 * paints those same analyzers across a whole area rather than one point
 * at a time — not yet built. */
export function AnalysisPage() {
  return (
    <PhasePlaceholder
      title="Terrain Analysis"
      description="Analyzer engine is live — try 'Analyze this spot' on the Map page. This heatmap view is next."
      phase={9}
      phaseName="Analysis Map"
      upcoming={[
        'Heatmap over the visible map area',
        'Analyzed zones with configurable weighting',
        'Zone comparison',
        'Points of interest detection',
        'No result presented as certainty when data is probabilistic',
      ]}
    />
  )
}
