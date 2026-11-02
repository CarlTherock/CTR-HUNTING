import { Download, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { formatDateKey, formatFetchedAt } from '../offline/savedForecastLogic'
import type { ForecastOrigin } from '../forecast/forecastSource'

/** Header: place, date, connection, last update (with where the data comes
 * from) and the « Télécharger pour ma sortie » shortcut. */
export function WeatherHeader({
  placeName,
  dateKey,
  online,
  origin,
  fetchedAt,
  stale,
  loading,
  onRefresh,
  onDownload,
}: {
  placeName: string
  dateKey: string | null
  online: boolean
  origin: ForecastOrigin | null
  fetchedAt: string | null
  stale: boolean
  loading: boolean
  onRefresh: () => void
  onDownload: () => void
}) {
  const updated = fetchedAt
    ? origin === 'saved'
      ? online
        ? `Prévisions enregistrées — téléchargées le ${formatFetchedAt(fetchedAt)}`
        : `Hors ligne — prévisions téléchargées le ${formatFetchedAt(fetchedAt)}`
      : origin === 'cached'
        ? `Dernière copie enregistrée le ${formatFetchedAt(fetchedAt)}`
        : `Mise à jour : ${formatFetchedAt(fetchedAt)}`
    : 'Aucune mise à jour'
  return (
    <header className="border-surface-800 flex flex-col gap-3 border-b pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-ink-100 text-xl font-semibold">Météo</h1>
          <p className="text-ink-300 text-sm" data-testid="weather-place">
            {placeName}
            {dateKey ? ` · ${formatDateKey(dateKey)}` : ''}
          </p>
        </div>
        <Badge variant={online ? 'success' : 'warning'}>
          {online ? (
            <Wifi size={12} className="mr-1 inline" aria-hidden="true" />
          ) : (
            <WifiOff size={12} className="mr-1 inline" aria-hidden="true" />
          )}
          {online ? 'En ligne' : 'Hors ligne'}
        </Badge>
      </div>
      <p className="text-ink-500 text-xs" data-testid="weather-updated">
        {updated}
        {stale ? ' · Prévisions anciennes' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="md" onClick={onDownload}>
          <Download size={16} aria-hidden="true" />
          Télécharger pour ma sortie
        </Button>
        <Button
          size="md"
          variant="secondary"
          onClick={onRefresh}
          disabled={loading || !online}
          aria-label="Actualiser la météo"
          title={online ? 'Actualiser' : 'Connexion requise'}
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
            aria-hidden="true"
          />
        </Button>
      </div>
    </header>
  )
}
