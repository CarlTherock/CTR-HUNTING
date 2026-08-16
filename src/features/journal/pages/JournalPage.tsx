import { PhasePlaceholder } from '@/components/ui'

export function JournalPage() {
  return (
    <PhasePlaceholder
      title="Journal"
      description="Field observations, photos and history."
      phase={13}
      phaseName="Journal"
      upcoming={[
        'Observation entries with notes & conditions',
        'Geotagged photos (Phase 12)',
        'Linked tracks & waypoints',
        'Timeline of past visits',
        'Everything viewable back on the map',
      ]}
    />
  )
}
