import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraStatus = 'idle' | 'starting' | 'streaming' | 'error'

/** A real hardware zoom range reported by the camera track itself
 * (`MediaTrackCapabilities.zoom` — verified live against the actual W3C
 * "MediaStream Image Capture" spec, a Working Draft extension to
 * `getUserMedia`, not core Media Capture and Streams). As of Chrome 87+
 * this works on desktop (full pan/tilt/zoom) and Android (zoom only);
 * Safari/iOS has no evidence of support. `null` on every browser/device
 * that doesn't report a real zoom capability — never fabricated. */
export interface ZoomRange {
  min: number
  max: number
  step: number
}

/**
 * Real live camera access via the standard `getUserMedia` API (Phase 12)
 * — never a fabricated/simulated video feed. Requests the environment
 * (rear) camera, since that's what a hunter photographing sign/game
 * needs, and exposes hardware zoom control when the track genuinely
 * reports one.
 */
export function useCameraStream() {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [errorReason, setErrorReason] = useState<string | null>(null)
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null)
  const [zoom, setZoomValue] = useState<number | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    trackRef.current = null
    setStream(null)
    setStatus('idle')
    setZoomRange(null)
    setZoomValue(null)
  }, [])

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('error')
      setErrorReason('Camera access is not supported by this browser.')
      return
    }
    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setStream(stream)
      const [track] = stream.getVideoTracks()
      trackRef.current = track ?? null

      // `zoom` isn't in TypeScript's built-in `MediaTrackCapabilities`
      // typing (the spec extension is ahead of lib.dom.d.ts), so this
      // reads it via a narrow, explicit cast rather than `any` — still a
      // real runtime feature check (`'zoom' in capabilities`), not an
      // assumption that it exists.
      const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: ZoomRange }) | undefined
      if (capabilities?.zoom) {
        setZoomRange(capabilities.zoom)
        const settings = track.getSettings() as MediaTrackSettings & { zoom?: number }
        setZoomValue(settings.zoom ?? capabilities.zoom.min)
      }

      setStatus('streaming')
    } catch (err) {
      setStatus('error')
      setErrorReason(err instanceof Error ? err.message : 'Could not access the camera.')
    }
  }, [])

  const setZoom = useCallback(async (value: number) => {
    const track = trackRef.current
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] })
      setZoomValue(value)
    } catch {
      // Real constraint application failures (device rejected the
      // value) are silently ignored — the zoom slider just doesn't move,
      // rather than showing a fabricated success.
    }
  }, [])

  useEffect(() => stop, [stop])

  return {
    status,
    errorReason,
    stream,
    zoomRange,
    zoom,
    setZoom,
    start,
    stop,
  }
}
