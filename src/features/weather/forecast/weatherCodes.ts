/**
 * WMO weather interpretation codes (the standard Open-Meteo returns in
 * `weather_code`) → a French label and an icon name. A missing code is
 * « indisponible », never a default sky.
 */
export type WeatherIcon =
  | 'sun'
  | 'cloud-sun'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm'
  | 'unknown'

export interface WeatherCondition {
  label: string
  icon: WeatherIcon
}

const UNKNOWN: WeatherCondition = { label: 'Conditions indisponibles', icon: 'unknown' }

const TABLE: Record<number, WeatherCondition> = {
  0: { label: 'Ciel dégagé', icon: 'sun' },
  1: { label: 'Généralement dégagé', icon: 'sun' },
  2: { label: 'Partiellement nuageux', icon: 'cloud-sun' },
  3: { label: 'Couvert', icon: 'cloud' },
  45: { label: 'Brouillard', icon: 'fog' },
  48: { label: 'Brouillard givrant', icon: 'fog' },
  51: { label: 'Bruine légère', icon: 'drizzle' },
  53: { label: 'Bruine', icon: 'drizzle' },
  55: { label: 'Bruine forte', icon: 'drizzle' },
  56: { label: 'Bruine verglaçante légère', icon: 'drizzle' },
  57: { label: 'Bruine verglaçante forte', icon: 'drizzle' },
  61: { label: 'Pluie légère', icon: 'rain' },
  63: { label: 'Pluie', icon: 'rain' },
  65: { label: 'Pluie forte', icon: 'rain' },
  66: { label: 'Pluie verglaçante légère', icon: 'rain' },
  67: { label: 'Pluie verglaçante forte', icon: 'rain' },
  71: { label: 'Neige légère', icon: 'snow' },
  73: { label: 'Neige', icon: 'snow' },
  75: { label: 'Neige forte', icon: 'snow' },
  77: { label: 'Grains de neige', icon: 'snow' },
  80: { label: 'Averses légères', icon: 'rain' },
  81: { label: 'Averses', icon: 'rain' },
  82: { label: 'Averses violentes', icon: 'rain' },
  85: { label: 'Averses de neige légères', icon: 'snow' },
  86: { label: 'Averses de neige fortes', icon: 'snow' },
  95: { label: 'Orage', icon: 'storm' },
  96: { label: 'Orage avec grêle légère', icon: 'storm' },
  99: { label: 'Orage avec forte grêle', icon: 'storm' },
}

export function conditionOf(code: number | null | undefined): WeatherCondition {
  if (code === null || code === undefined) return UNKNOWN
  return TABLE[code] ?? UNKNOWN
}
