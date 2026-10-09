import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import type { ViewMode } from './cameraPrefs'

export interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement | null>
  displayRef: RefObject<HTMLCanvasElement | null>
  mode: ViewMode
  /** Comparison divider, 10..90 (% of the width, filtered on the left). */
  divider: number
  onDivider: (value: number) => void
}

/**
 * The image layer: the live video and the highlighted canvas are two boxes of
 * the SAME size (the whole camera surface) with the SAME `object-fit: cover`,
 * so they are cropped identically and a highlighted pixel sits exactly on the
 * video pixel it comes from. The canvas keeps the video's aspect ratio (it is
 * only drawn smaller, for speed), so nothing is stretched. The comparison is a
 * single image cut by a movable divider, not two thumbnails.
 */
export function CameraStage({
  videoRef,
  displayRef,
  mode,
  divider,
  onDivider,
}: CameraStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function moveTo(clientX: number) {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    onDivider(Math.min(90, Math.max(10, ((clientX - rect.left) / rect.width) * 100)))
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true
    event.currentTarget.setPointerCapture?.(event.pointerId)
    moveTo(event.clientX)
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) moveTo(event.clientX)
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    dragging.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 2
    if (event.key === 'ArrowLeft') onDivider(Math.max(10, divider - step))
    else if (event.key === 'ArrowRight') onDivider(Math.min(90, divider + step))
    else return
    event.preventDefault()
  }

  const split = mode === 'split'
  return (
    <div
      ref={stageRef}
      data-testid="camera-stage"
      className="absolute inset-0 overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Image originale de la caméra"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <canvas
        ref={displayRef}
        aria-label="Image avec surbrillance des zones candidates"
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          visibility: mode === 'original' ? 'hidden' : 'visible',
          clipPath: split ? `inset(0 ${100 - divider}% 0 0)` : undefined,
        }}
      />
      {split && (
        <>
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 rounded bg-black/55 px-1.5 py-0.5 text-xs text-white [@media(max-height:480px)]:hidden">
            Filtrée
          </span>
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded bg-black/55 px-1.5 py-0.5 text-xs text-white [@media(max-height:480px)]:hidden">
            Originale
          </span>
          <div
            role="slider"
            tabIndex={0}
            aria-label="Séparateur de comparaison"
            aria-orientation="horizontal"
            aria-valuemin={10}
            aria-valuemax={90}
            aria-valuenow={Math.round(divider)}
            aria-valuetext={`Filtrée à gauche, originale à droite, séparateur à ${Math.round(divider)} %`}
            data-testid="camera-divider"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="absolute top-0 bottom-0 z-[1] flex w-11 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center"
            style={{ left: `${divider}%` }}
          >
            <span className="h-full w-0.5 bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
            <span
              aria-hidden="true"
              className="absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-xs font-bold text-black shadow"
            >
              ⇆
            </span>
          </div>
        </>
      )}
    </div>
  )
}
