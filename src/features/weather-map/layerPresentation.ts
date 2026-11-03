import {
  Cloud,
  CloudRain,
  Gauge,
  Radar,
  Thermometer,
  Waves,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import type { WeatherMapLayerId } from '@/types'

export interface LayerPresentation {
  icon: LucideIcon
  description: string
}

/** Short, factual descriptions of the layers that really exist (GeoMet).
 * Nothing is listed here that the provider cannot serve. */
export const LAYER_PRESENTATION: Record<WeatherMapLayerId, LayerPresentation> = {
  radar: {
    icon: Radar,
    description: 'Pluie et neige observées par radar (1 km), dernières heures',
  },
  precipitation: {
    icon: CloudRain,
    description: 'Précipitations prévues, accumulation sur 1 h',
  },
  temperature: { icon: Thermometer, description: 'Température prévue près du sol' },
  wind: { icon: Wind, description: 'Vitesse du vent prévue à 10 m' },
  gusts: { icon: Waves, description: 'Rafales prévues à 10 m' },
  clouds: { icon: Cloud, description: 'Couverture nuageuse prévue' },
  pressure: { icon: Gauge, description: 'Pression au niveau de la mer (isobares)' },
}

export interface LayerGroup {
  title: string
  ids: WeatherMapLayerId[]
}

/** Observed radar, forecast precipitation and the other forecasts are kept
 * apart so an observation is never taken for a forecast. */
export const LAYER_GROUPS: LayerGroup[] = [
  { title: 'Observé', ids: ['radar'] },
  { title: 'Précipitations prévues', ids: ['precipitation'] },
  {
    title: 'Autres prévisions',
    ids: ['temperature', 'wind', 'gusts', 'clouds', 'pressure'],
  },
]
