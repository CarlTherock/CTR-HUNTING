import { PhasePlaceholder } from '@/components/ui'

export function WeatherPage() {
  return (
    <PhasePlaceholder
      title="Weather & Wind"
      description="Current conditions and 24h forecast timeline."
      phase={5}
      phaseName="Weather"
      upcoming={[
        'Temperature, humidity, pressure',
        'Precipitation & cloud cover',
        'Hourly forecast',
        'Wind direction, speed & gusts (Phase 6)',
        'Interactive 24h timeline (Phase 6/7)',
        'Sunrise/sunset & moon phase (Phase 7)',
      ]}
    />
  )
}
