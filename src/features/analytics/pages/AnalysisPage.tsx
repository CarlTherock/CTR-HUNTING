import { Activity, Compass, History, LayoutGrid, Sun, Wind } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from '@/components/ui'

const ANALYZERS = [
  { icon: Compass, label: 'Terrain', description: 'Real slope/aspect from the map\'s elevation data.' },
  { icon: Activity, label: 'Vegetation', description: 'Real OpenStreetMap land-cover tags near the point.' },
  { icon: Sun, label: 'Weather', description: 'A fresh on-demand forecast for that exact spot.' },
  { icon: Wind, label: 'Wind', description: 'A focused reading for that spot, checked against any saved optimal wind.' },
  { icon: Sun, label: 'Time', description: 'Sun/moon/solunar data for the current moment.' },
  { icon: History, label: 'History', description: 'Your own nearby waypoints and past GPS tracks.' },
]

/**
 * Phases 8 (Analytics Engine) and 9 (Analysis Map) are both complete —
 * this page is a landing/overview for them, since the actual tools live
 * on the Map page (they need a live `MapInstance` for real elevation
 * queries): "Analyze this spot" for one point, and the analysis heatmap
 * toggle for the whole visible area.
 */
export function AnalysisPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Terrain Analysis"
        description="6 independent, explainable analyzers — open the Map page to use them."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid size={18} className="text-brand-400" aria-hidden="true" />
            Where to find it
          </CardTitle>
          <CardDescription>
            Both tools live on the Map page, since they need a live elevation query at the tapped
            point.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-ink-300">
            <span className="text-ink-100 font-medium">Analyze this spot</span> — tap the activity
            icon, then tap the map once, for a full explainable breakdown of one point.
          </p>
          <p className="text-ink-300">
            <span className="text-ink-100 font-medium">Analysis heatmap</span> — tap the grid icon
            to color the whole visible area by score, switchable between the combined score or any
            single analyzer.
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-ink-300 mb-3 text-sm font-semibold">The 6 analyzers</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ANALYZERS.map((analyzer) => (
            <Card key={analyzer.label} className="flex items-start gap-3 p-3">
              <analyzer.icon size={18} className="text-brand-400 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-ink-100 text-sm font-medium">{analyzer.label}</p>
                <p className="text-ink-500 text-xs">{analyzer.description}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <p className="text-ink-500 text-xs">
        Every score is a probabilistic read from real data, never presented as certainty — expand
        any analyzer's factors to see exactly what produced it.
      </p>
    </div>
  )
}
