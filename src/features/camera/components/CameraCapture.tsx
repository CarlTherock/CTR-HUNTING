import { useEffect, useRef, useState } from 'react'
import { Camera, Check, RotateCcw, X, ZoomIn } from 'lucide-react'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { buildCanvasFilter, DEFAULT_ADJUSTMENTS } from '@/utils/imageAdjustments'
import type { ImageAdjustments } from '@/utils/imageAdjustments'
import { useCameraStream } from '../useCameraStream'
import type { Coordinate } from '@/types'

export interface CapturedPhoto {
  originalBlob: Blob
  editedBlob: Blob
  coordinate?: Coordinate
}

export interface CameraCaptureProps {
  onSave: (photo: CapturedPhoto) => void
  onClose: () => void
}

const FILTERS: { value: ImageAdjustments['filter']; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'grayscale', label: 'Noir et blanc' },
  { value: 'sepia', label: 'Sépia' },
  { value: 'vivid', label: 'Éclatant' },
]

/**
 * Phase 12 — live in-app camera: a real `getUserMedia` preview, a real
 * hardware zoom slider when the device reports one (digital/CSS zoom
 * otherwise, clearly labeled as such), capture-to-canvas, then a
 * non-destructive brightness/contrast/filter review step before saving.
 * The original captured frame is always kept (`originalBlob`) — the
 * review step never mutates it, only redraws it with a real Canvas2D
 * `filter` string onto a *separate* canvas for the edited version.
 */
export function CameraCapture({ onSave, onClose }: CameraCaptureProps) {
  const { status, errorReason, stream, zoomRange, zoom, setZoom, start, stop } =
    useCameraStream()
  const gpsReading = useGeolocation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS)
  const [digitalZoom, setDigitalZoom] = useState(1)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Move focus into the dialog on open so keyboard / screen-reader users
  // land inside it; give it back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    return () => opener?.focus?.()
  }, [])

  useEffect(() => {
    void start()
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  function capture() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        setOriginalBlob(blob)
        setPreviewUrl(URL.createObjectURL(blob))
      },
      'image/jpeg',
      0.92,
    )
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setOriginalBlob(null)
    setAdjustments(DEFAULT_ADJUSTMENTS)
  }

  function save() {
    const image = imageRef.current
    if (!originalBlob || !image) return
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.filter = buildCanvasFilter(adjustments)
    ctx.drawImage(image, 0, 0)
    canvas.toBlob(
      (editedBlob) => {
        if (!editedBlob) return
        onSave({
          originalBlob,
          editedBlob,
          coordinate: gpsReading.status === 'available' ? gpsReading.value : undefined,
        })
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Caméra"
      tabIndex={-1}
      className="bg-surface-950 fixed inset-0 z-50 flex flex-col outline-none"
    >
      <div className="flex items-center justify-between p-3">
        <span className="text-ink-100 text-sm font-medium">Caméra</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la caméra"
          className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {status === 'error' && (
          <p className="text-status-danger flex h-full items-center justify-center p-6 text-center text-sm">
            {errorReason}
          </p>
        )}

        {!previewUrl ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={!zoomRange ? { transform: `scale(${digitalZoom})` } : undefined}
          />
        ) : (
          <img
            ref={imageRef}
            src={previewUrl}
            alt="Aperçu de la photo prise"
            className="h-full w-full object-contain"
            style={{ filter: buildCanvasFilter(adjustments) }}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {!previewUrl ? (
          <>
            <label className="text-ink-300 flex items-center gap-2 text-xs">
              <ZoomIn size={14} aria-hidden="true" />
              {zoomRange ? 'Zoom' : 'Zoom (numérique)'}
              <input
                type="range"
                min={zoomRange?.min ?? 1}
                max={zoomRange?.max ?? 3}
                step={zoomRange?.step ?? 0.1}
                value={zoomRange ? (zoom ?? zoomRange.min) : digitalZoom}
                onChange={(e) => {
                  const value = Number(e.target.value)
                  if (zoomRange) void setZoom(value)
                  else setDigitalZoom(value)
                }}
                aria-label={zoomRange ? 'Zoom' : 'Zoom numérique'}
                className="accent-brand-500 flex-1"
              />
            </label>
            <button
              type="button"
              onClick={capture}
              disabled={status !== 'streaming'}
              aria-label="Prendre la photo"
              className="bg-brand-500 disabled:bg-surface-700 mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white disabled:cursor-not-allowed"
            >
              <Camera size={28} aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-ink-300 flex items-center gap-2 text-xs">
                Luminosité
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={adjustments.brightnessPercent}
                  onChange={(e) =>
                    setAdjustments((a) => ({
                      ...a,
                      brightnessPercent: Number(e.target.value),
                    }))
                  }
                  className="accent-brand-500 flex-1"
                />
              </label>
              <label className="text-ink-300 flex items-center gap-2 text-xs">
                Contraste
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={adjustments.contrastPercent}
                  onChange={(e) =>
                    setAdjustments((a) => ({
                      ...a,
                      contrastPercent: Number(e.target.value),
                    }))
                  }
                  className="accent-brand-500 flex-1"
                />
              </label>
              <div role="group" aria-label="Filtre" className="flex gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setAdjustments((a) => ({ ...a, filter: f.value }))}
                    aria-pressed={adjustments.filter === f.value}
                    className={`rounded-md px-2 py-1 text-xs pointer-coarse:min-h-11 pointer-coarse:px-3 ${adjustments.filter === f.value ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={retake}
                className="border-surface-600 text-ink-300 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm pointer-coarse:min-h-11"
              >
                <RotateCcw size={14} aria-hidden="true" />
                Reprendre
              </button>
              <button
                type="button"
                onClick={save}
                className="bg-brand-500 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white pointer-coarse:min-h-11"
              >
                <Check size={14} aria-hidden="true" />
                Enregistrer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
