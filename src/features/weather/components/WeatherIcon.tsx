import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  CircleHelp,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { WeatherIcon as Kind } from '../forecast/weatherCodes'

const ICONS: Record<Kind, LucideIcon> = {
  sun: Sun,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
  unknown: CircleHelp,
}

export function WeatherIcon({ kind, size = 24 }: { kind: Kind; size?: number }) {
  const Icon = ICONS[kind]
  return <Icon size={size} className="text-brand-400 shrink-0" aria-hidden="true" />
}
