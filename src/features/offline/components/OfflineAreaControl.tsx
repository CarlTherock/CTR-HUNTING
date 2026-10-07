import { Download, Minus, Plus, RefreshCw, X } from 'lucide-react'
import { ToolSlot, ToolTrigger } from '@/components/map-tools'
import { Button } from '@/components/ui'
import { formatBytes } from '@/utils/format'
import { tileCountForBounds } from '@/utils/tiles'
import { useOfflineStore } from '../state/offlineStore'
import type { MapInstance } from '@/services/map'
import type { MapBaseLayerId } from '@/types'

export interface OfflineAreaControlProps {
  /** A getter, not the instance directly — the map may not exist yet on
   * first render, and re-reading it fresh avoids a stale closure over
   * whatever instance was mounted when this component first rendered. */
  getMapInstance: () => MapInstance | null
  baseLayer: MapBaseLayerId
  currentZoom: number
}

/** Floating "download this area for offline use" control — arms by
 * framing the current view (`getBounds()` + the current zoom), lets the
 * user pick how many extra zoom levels to include, shows the real
 * (calculated, not fabricated) tile count, then downloads with live
 * progress. Opposite corner from `TrackRecorderControl`'s idle button so
 * neither overlaps the other. */
export function OfflineAreaControl({ getMapInstance, baseLayer, currentZoom }: OfflineAreaControlProps) {
  const mode = useOfflineStore((state) => state.mode)
  const extraZoomLevels = useOfflineStore((state) => state.extraZoomLevels)
  const selectedBounds = useOfflineStore((state) => state.selectedBounds)
  const selectedZoom = useOfflineStore((state) => state.selectedZoom)
  const downloadProgress = useOfflineStore((state) => state.downloadProgress)
  const areas = useOfflineStore((state) => state.areas)
  const startSelecting = useOfflineStore((state) => state.startSelecting)
  const cancelSelecting = useOfflineStore((state) => state.cancelSelecting)
  const setExtraZoomLevels = useOfflineStore((state) => state.setExtraZoomLevels)
  const startDownload = useOfflineStore((state) => state.startDownload)
  const cancelDownload = useOfflineStore((state) => state.cancelDownload)
  const refreshArea = useOfflineStore((state) => state.refreshArea)

  if (mode === 'idle') {
    // Areas already downloaded for the layer currently on screen — offered
    // for a manual re-download (e.g. after reconnecting) rather than any
    // automatic background refresh, which would need a lot more
    // infrastructure (Background Sync) than this slice warrants.
    const refreshable = areas.filter((a) => a.baseLayer === baseLayer && a.status === 'complete')

    return (
      <>
        {refreshable.map((area) => (
          <ToolSlot key={area.id} order={21}>
            <button
              type="button"
              onClick={() => {
                const map = getMapInstance()
                if (map) void refreshArea(map, area)
              }}
              title={`Actualiser « ${area.name} »`}
              className="border-surface-600 text-ink-300 hover:bg-surface-800 flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left text-sm transition-colors"
            >
              <RefreshCw size={16} aria-hidden="true" className="shrink-0" />
              <span className="truncate">Actualiser « {area.name} »</span>
            </button>
          </ToolSlot>
        ))}
        <ToolTrigger
          label="Télécharger cette zone hors ligne"
          icon={<Download size={18} aria-hidden="true" />}
          onClick={() => {
            const map = getMapInstance()
            if (map) startSelecting(map.getBounds(), currentZoom)
          }}
          order={20}
        />
      </>
    )
  }

  if (mode === 'selecting' && selectedBounds && selectedZoom !== null) {
    const minZoom = Math.round(selectedZoom)
    const maxZoom = minZoom + extraZoomLevels
    const tileCount = tileCountForBounds(selectedBounds, minZoom, maxZoom)

    return (
      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="border-surface-600 bg-surface-900 w-full max-w-sm rounded-lg border p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-ink-100 text-sm font-semibold">Télécharger cette zone</h2>
            <button
              type="button"
              onClick={cancelSelecting}
              aria-label="Annuler"
              className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <p className="text-ink-500 mb-3 text-xs">
            Télécharge la zone actuellement affichée pour l’utiliser hors ligne.
          </p>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-ink-500 text-xs font-medium">Niveaux de zoom supplémentaires</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExtraZoomLevels(extraZoomLevels - 1)}
                disabled={extraZoomLevels <= 0}
                aria-label="Moins de niveaux de zoom"
                className="border-surface-600 text-ink-300 hover:bg-surface-800 rounded-md border p-1 pointer-coarse:p-3.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={14} aria-hidden="true" />
              </button>
              <span className="text-ink-100 w-4 text-center text-sm">{extraZoomLevels}</span>
              <button
                type="button"
                onClick={() => setExtraZoomLevels(extraZoomLevels + 1)}
                disabled={extraZoomLevels >= 3}
                aria-label="Plus de niveaux de zoom"
                className="border-surface-600 text-ink-300 hover:bg-surface-800 rounded-md border p-1 pointer-coarse:p-3.5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <p className="text-ink-300 mb-4 text-sm">
            {tileCount} tuile{tileCount === 1 ? '' : 's'} (zoom {minZoom}–{maxZoom})
          </p>

          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => {
              const map = getMapInstance()
              if (map) void startDownload(map, baseLayer)
            }}
          >
            <Download size={14} aria-hidden="true" />
            Lancer le téléchargement
          </Button>
        </div>
      </div>
    )
  }

  if (mode === 'downloading') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="border-surface-600 bg-surface-900/95 text-ink-100 flex w-full max-w-sm items-center justify-between gap-3 rounded-lg border p-3 shadow-2xl">
          <span className="text-sm">
            Téléchargement… {downloadProgress?.tilesDownloaded ?? 0} tuiles (
            {formatBytes(downloadProgress?.bytesDownloaded ?? 0)})
          </span>
          <button
            type="button"
            onClick={cancelDownload}
            aria-label="Annuler le téléchargement"
            className="text-status-danger flex items-center justify-center hover:brightness-110 pointer-coarse:size-11"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return null
}
