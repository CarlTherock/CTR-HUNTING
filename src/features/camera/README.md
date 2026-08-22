# features/camera

**Status:** Phase 12 complete — live in-app camera, real hardware zoom
where supported, brightness/contrast/filter adjustments, GPS + timestamp
tagging, original image always kept.

## `useCameraStream.ts`

Real live camera access via the standard `getUserMedia` API — never a
simulated feed. Requests the rear (`environment`) camera, since that's
what photographing sign/game needs.

Zoom is genuinely two different things depending on the device, and this
hook is honest about which one is active:

- **Real hardware zoom** — `MediaTrackCapabilities.zoom` (verified live
  against the actual W3C "MediaStream Image Capture" spec, a Working
  Draft extension to `getUserMedia`, not part of core Media Capture and
  Streams). Confirmed real usage: `track.getCapabilities().zoom` →
  `{min, max, step}`, `track.applyConstraints({ advanced: [{ zoom }] })`
  to change it. Support is real but narrow — Chrome 87+ desktop (full
  pan/tilt/zoom) and Android (zoom only); no evidence of Safari/iOS
  support. TypeScript's built-in DOM types don't even include `zoom` yet
  (a confirmed, still-open gap — microsoft/TypeScript#56589), so this is
  read via a narrow explicit cast, not `any`.
- **Digital zoom fallback** — a plain CSS `transform: scale()` on the
  video preview, used whenever the device doesn't report a real
  capability. `CameraCapture.tsx`'s zoom slider label says "Zoom" vs.
  "Zoom (digital)" depending on which is actually active — never
  presenting a CSS scale as if it were real optical/hybrid zoom.

## `components/CameraCapture.tsx`

A full-screen live preview → capture → review flow:

1. Live `<video>` preview of the real stream.
2. Capture draws the current video frame onto a canvas at its native
   resolution — this raw frame becomes `originalBlob`, kept untouched
   for the rest of the flow (Phase 12's "original image always kept"
   rule).
3. A review step with brightness/contrast sliders and filter presets
   (grayscale/sepia/vivid) — `utils/imageAdjustments.ts` builds a real
   Canvas2D `filter` string (the same standard CSS `filter` syntax used
   anywhere else on the web) and redraws it live from the original image
   each time a slider moves, so adjustments are always non-destructive
   previews, never applied to `originalBlob` itself.
4. Saving redraws the original once more with the final filter onto a
   *separate* canvas, producing `editedBlob` — both blobs are handed to
   the caller.

Real GPS (`useGeolocation`) is attached at save time, when a fix is
available — `coordinate` is simply absent otherwise, never guessed.

## Storage

`Photo` (`types/photo.ts`) gained `originalBlob` and `coordinate` fields.
`photosRepository.addPhoto()` defaults `originalBlob` to `blob` when not
given, so slice 2.4's plain file-picker path (still available in
`WaypointPhotos.tsx` as "Choose a photo," for picking an existing photo
the in-app camera can't do) needs no changes and keeps working exactly
as before.

**Not verified live** (this environment has no camera hardware/no map
API key to reach a waypoint's photo panel): the actual live video
preview, capture, and real hardware zoom detection on a physical device.
`useCameraStream` (6 tests, mocked `getUserMedia`/track capabilities),
`CameraCapture` (6 tests, mocked hook), and the full
`WaypointPhotos`/`photosRepository` wiring (3 + existing tests) are
fully unit/integration tested instead.
