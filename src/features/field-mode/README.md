# features/field-mode

**Status:** Phase 11 complete — a simplified, low-power, large-touch-
target map UI, plus a real device compass.

`state/fieldModeStore.ts` — a persisted toggle (via `settingsRepository`,
the same pattern as other app-level preferences), so it survives
reloads without its own Dexie table.

`useCompassHeading.ts` — real device compass heading via the browser's
`DeviceOrientationEvent` API, never simulated:

- iOS Safari's non-standard `webkitCompassHeading` (already a direct
  compass bearing) — but iOS 13+ requires an explicit user-gesture-
  triggered permission call (`DeviceOrientationEvent.requestPermission()`)
  before any orientation events fire, which is why this hook exposes
  `requestPermission()`/`needsPermission` rather than auto-starting
  everywhere.
- The standard `deviceorientationabsolute` event (`alpha`, counter-
  clockwise from the device's initial heading when `absolute` is true)
  on platforms without the iOS-only property, converted to a clockwise-
  from-north bearing.

Reports `unavailable` with the real reason (unsupported, denied, no
reading yet) rather than ever guessing a heading. `components/
CompassDisplay.tsx` renders it as a large rotating compass rose.

## Map page integration

`MapPage.tsx` reads `fieldModeStore.enabled` and, while on:

- Hides the advanced tools (layer manager, 3D/terrain controls, offline
  area management, terrain info, elevation profile, wind layer, spot
  analysis, analysis heatmap) — "simplified... readability."
- Shows `CompassDisplay` instead of the layer manager panel.
- Enlarges `GpsControl` and `WaypointControl` (a `large` prop bumping
  padding/icon size) — "large buttons... one-handed use."
- Turns off the wind flow-field and analysis heatmap layers the moment
  Field Mode is switched on, stopping their `requestAnimationFrame`
  loops — a genuine "low power draw," not just a visual simplification.
  (Re-enabling either one manually afterward, while Field Mode stays on,
  is still possible — this only forces them off at the moment of
  switching in.)

GPS itself is untouched (`enableHighAccuracy: true` stays on) — accurate
position is this app's core purpose, and the real power lever here is
the animated canvases, not degrading location accuracy.

"Observation" and "camera" (also listed in the roadmap's Phase 11 goal)
are Phase 12/13's own features — Field Mode doesn't build ahead of them;
it will link to them once they exist.

**Not verified live**: the Map page's field-mode-specific control
hiding/enlarging (no map API key in this environment) — same caveat as
other map-dependent features. The Field Mode toggle itself (Settings
page) *was* verified live: it persists correctly across a real reload.
The compass hook's DeviceOrientationEvent handling is fully unit-tested
(mocked events), not verified against a real physical device/sensor.
