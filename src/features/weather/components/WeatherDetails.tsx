import { Cloud, Droplets, Eye, Gauge, Sun, Thermometer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import type { PointHourly } from '@/types'
import { num } from '../forecast/format'

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={18} className="text-brand-400 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-ink-100 text-sm font-medium">{value}</p>
        <p className="text-ink-500 text-xs">{label}</p>
      </div>
    </div>
  )
}

/** Secondary details of the selected hour. Absent values read « indisponible ». */
export function WeatherDetails({ hour }: { hour: PointHourly | null }) {
  return (
    <Card data-testid="weather-details">
      <CardHeader>
        <CardTitle>Détails météo</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Detail
          icon={Droplets}
          label="Humidité"
          value={num(hour?.relativeHumidityPercent, '%')}
        />
        <Detail
          icon={Gauge}
          label="Pression"
          value={num(hour?.surfacePressureHpa, 'hPa')}
        />
        <Detail icon={Sun} label="Indice UV" value={num(hour?.uvIndex, '', 1)} />
        <Detail
          icon={Eye}
          label="Visibilité"
          value={
            hour?.visibilityMeters === null || hour?.visibilityMeters === undefined
              ? 'indisponible'
              : `${(hour.visibilityMeters / 1000).toFixed(1)} km`
          }
        />
        <Detail icon={Cloud} label="Nuages" value={num(hour?.cloudCoverPercent, '%')} />
        <Detail
          icon={Thermometer}
          label="Ressenti"
          value={num(hour?.apparentTemperatureCelsius, '°C')}
        />
      </CardContent>
    </Card>
  )
}
