# features/guidance

**Status:** "Aller à" — bird's-eye guidance from the device to a SAVED waypoint,
plus a direction cone on the "you are here" dot and an optional "follow my
position" mode of the map.

It answers three questions, all without a network: where am I, where does the
phone point, where is the waypoint. It is **not** navigation: no route, no
trail, no road, no turn instruction, no ETA, no "you have arrived".

## Behaviour

- Start: the **Aller à** button of a saved waypoint's sheet (never on a waypoint
  being created). It opens the panel and closes the sheet so the map is visible.
- The panel (`components/GuidancePanel.tsx`, bottom-left of the map, collapsible
  with "Réduire"/"Agrandir", "Arrêter le guidage" always visible) shows the
  distance (haversine), the bearing from TRUE north with its French cardinal
  (`42° NE (nord vrai)`), the GPS state / accuracy / age (same helpers as
  "Ma position"), the compass state, and the disclaimer
  « Guidage à vol d’oiseau — pas un itinéraire routier ou un sentier sécurisé. ».
- The map shows a dashed fuchsia straight line from the device to the waypoint
  (`MapInstance.setGuidanceLine`, its own source/layers — not a track) and, on
  the blue "you are here" dot, a direction cone (`setUserHeading`).
- Guidance and "Enregistrer un suivi" are independent: neither starts or stops
  the other. Guidance **never writes**: it keeps only the destination id, reads
  the coordinates from `waypointsStore` each time, creates no track and never
  modifies the waypoint (tests assert the records stay byte-identical and the
  tracks table stays empty). It is not persisted. If the waypoint is deleted,
  guidance stops with a visible notice.

## Rules of the view-model (`guidanceView.ts`, pure)

| GPS situation                                | Result                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fix <= 15 s (`recent`)                       | distance, bearing, line                                                                                                                                                    |
| fix 15 s - 120 s (`old`)                     | same, marked « non fraîches » with the age                                                                                                                                 |
| fix > 120 s (`stale`), none, denied, invalid | **no** distance, **no** direction, no line; the reason is shown                                                                                                            |
| distance <= max(accuracy, 10 m)              | « À proximité — la précision du GPS (±N m) ne permet pas d’être plus précis. » No arrow, no bearing, never an arrival message                                              |
| no reliable TRUE-north phone heading         | bearing in degrees + cardinal, **no** relative arrow, « Cap du téléphone indisponible » with the reason (no compass, lost, unreliable, declination unknown, no permission) |

The relative arrow rotates by `relativeAngle(bearingTrue, headingTrue)` and its
displayed angle goes through `unwrapAngle`, so it never spins the long way at
359° -> 0°.

## Sources of position and heading

- **Position:** the single GPS watch of `MapPage` (`useGeolocation`), passed down
  as a prop. Guidance never opens a second watch.
- **Phone heading:** `field-mode/useCompassHeading` (the same hook as Field
  Mode). Android: `deviceorientationabsolute` (alpha/beta/gamma, W3C
  `compassHeading`); iOS: `webkitCompassHeading` + `webkitCompassAccuracy`
  (negative = invalid, > 25° = « peu fiable, calibrez »). Relative-only events
  are ignored. The screen rotation is applied. Updates are throttled to ~10 Hz,
  the heading is lost after 3 s without an event (« Cap perdu »), and listeners
  and timers exist only while the panel is mounted and the page visible. iOS
  needs a user gesture: the panel offers « Activer la boussole ».
- **Magnetic vs true:** the sensor gives MAGNETIC north. The TRUE heading adds the
  declination from `services/geomagnetic.ts` (WMM2025, local, cached per 0.5°
  cell; `null` outside the model's validity). Bearings are TRUE, so only a true
  heading is compared with them.
- **GPS course** (`courseDegrees`) is the direction of TRAVEL, not where the phone
  points. It is never used for the arrow or the cone; when moving at >= 1 m/s it
  is shown only as « Direction de déplacement (GPS) ».

## Follow my position

Rail button « Suivre ma position » (`map/state/followStore.ts`, `off` |
`following` | `paused`, not persisted). While `following`, each RECENT fix
recentres the map (zoom/rotation kept); an old or stale fix never does. A user
gesture on the map (drag, zoom, rotate, tilt — reported by
`CreateMapOptions.onUserInteraction` only when MapLibre gives an `originalEvent`)
pauses it and shows « Reprendre le suivi ». « Me localiser » still recentres once.

## Limits

- GPS accuracy is typically 3-10 m in the open and much worse under canopy, in
  valleys or between buildings; the distance and bearing inherit that. Close to
  the target the app deliberately stops giving a direction.
- A phone compass is disturbed by metal, vehicles, magnets and electronics, and
  needs calibration (figure-eight motion). Android gives no accuracy figure, so
  « précision inconnue » is displayed. The compass maths are unit-tested with
  simulated events; **no physical compass (Android or iPhone) was validated**.
- The straight line ignores terrain, water, fences and private property.
- Works offline: distance, bearing, declination and the line are local
  computations. The base map underneath still needs its tiles to be downloaded
  (see `features/offline`).
