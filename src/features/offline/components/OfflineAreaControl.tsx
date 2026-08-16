import { Download, Minus, Plus, RefreshCw, X } from 'lucide-react'
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
        {refreshable.length > 0 && (
          <div className="border-surface-600 bg-surface-900/90 absolute top-[21rem] right-3 z-10 flex max-w-[10rem] flex-col gap-1 rounded-lg border p-1.5 shadow-lg backdrop-blur-sm">
            {refreshable.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => {
                  const map = getMapInstance()
                  if (map) void refreshArea(map, area)
                }}
                title={`Refresh "${area.name}"`}
                className="text-ink-300 hover:bg-surface-800 hover:text-brand-400 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition-colors"
              >
                <RefreshCw size={12} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{area.name}</span>
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            const map = getMapInstance()
            if (map) startSelecting(map.getBounds(), currentZoom)
          }}
          title="Download this area for offline use"
          aria-label="Download this area for offline use"
          className="border-surface-600 bg-surface-900/90 text-brand-400 hover:bg-surface-800 absolute top-[17rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors"
        >
          <Download size={18} aria-hidden="true" />
        </button>
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
            <h2 className="text-ink-100 text-sm font-semibold">Download this area</h2>
            <button
              type="button"
              onClick={cancelSelecting}
              aria-label="Cancel"
              className="text-ink-500 hover:text-ink-100"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <p className="text-ink-500 mb-3 text-xs">
            Downloads the area currently in view for offline use.
          </p>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-ink-500 text-xs font-medium">Extra zoom levels</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExtraZoomLevels(extraZoomLevels - 1)}
                disabled={extraZoomLevels <= 0}
                aria-label="Fewer zoom levels"
                className="border-surface-600 text-ink-300 hover:bg-surface-800 rounded-md border p-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={14} aria-hidden="true" />
              </button>
              <span className="text-ink-100 w-4 text-center text-sm">{extraZoomLevels}</span>
              <button
                type="button"
                onClick={() => setExtraZoomLevels(extraZoomLevels + 1)}
                disabled={extraZoomLevels >= 3}
                aria-label="More zoom levels"
                className="border-surface-600 text-ink-300 hover:bg-surface-800 rounded-md border p-1 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          <p className="text-ink-300 mb-4 text-sm">
            {tileCount} tile{tileCount === 1 ? '' : 's'} (zoom {minZoom}–{maxZoom})
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
            Start download
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
            Downloading… {downloadProgress?.tilesDownloaded ?? 0} tiles (
            {formatBytes(downloadProgress?.bytesDownloaded ?? 0)})
          </span>
          <button
            type="button"
            onClick={cancelDownload}
            aria-label="Cancel download"
            className="text-status-danger hover:brightness-110"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return null
}
