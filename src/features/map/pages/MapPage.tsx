import { PhasePlaceholder } from '@/components/ui'

export function MapPage() {
  return (
    <PhasePlaceholder
      title="Map"
      description="Interactive 2D/3D terrain map."
      phase={1}
      phaseName="Map"
      upcoming={[
        'Interactive pan/zoom map',
        'Live GPS position',
        'Satellite & topographic base layers',
        'Trails, hydrography, contour lines',
        'Layer manager',
        '2D ↔ 3D toggle (full 3D in Phase 4)',
      ]}
    />
  )
}
