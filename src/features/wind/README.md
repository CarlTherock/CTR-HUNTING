# features/wind

**Status:** Phase 6 complete — animated flow-field visualization,
interactive 24h timeline, and a per-waypoint "Optimal Wind" feature that
goes beyond the bare spec (inspired by onX Hunt's "Optimal Wind" concept,
see `NOTES_TECHNIQUES_FUTURES.md`).

Provider: `src/services/wind/` (`WindProvider` interface,
`OpenMeteoWindProvider` implementation) — same keyless, free Open-Meteo
provider as `features/weather/`, but requesting a **grid** of points in
one batched call (`buildGrid()` evenly spaces cell centers across the
current map bounds; Open-Meteo's comma-joined `latitude=`/`longitude=`
batch support and its top-level-array response shape were both verified
live, not assumed, before writing the normalization code). Real verified
parameters: `wind_speed_10m`, `wind_direction_10m` (0–360°, meteorological
"from" convention), `wind_gusts_10m`.

## Flow-field animation

Per the project's own prior research (`NOTES_TECHNIQUES_FUTURES.md`:
"particle flow field, not a physics engine — visually sufficient, much
lighter"), the animation is a lightweight particle system, not a CFD
simulation:

- `utils/windField.ts` is pure and framework-agnostic — `nearestSample()`
  picks the real grid sample closest to a coordinate (never interpolated
  between samples), `windAt()` looks up that sample's reading at a given
  hour offset, `advancePosition()` moves a point along a real wind vector
  for a timestep.
- The canvas itself lives entirely inside `MapLibreProvider.ts`
  (`createWindLayer()`) — `MapProvider.setWindField(field, hourOffset)` is
  the only surface feature code touches, keeping the raw MapLibre engine
  out of `features/`. Particle speed is deliberately exaggerated for
  visual legibility — explicitly not physically accurate, matching the
  project's own design note above.

## UI

`state/windStore.ts` follows `weatherStore`'s "don't hammer the API"
pattern: fetching only happens on first enable (or an explicit "Refresh
for this area"), never automatically on every pan/zoom. Toggling the
layer off keeps the already-fetched field cached in memory rather than
discarding it, so re-enabling is instant.

`components/WindLayerControl.tsx` is a floating toggle + bottom-sheet
panel: current speed/gusts/direction (a rotated compass icon +
`compassLabel()`, reused from `utils/terrain.ts` rather than duplicated),
and a 24-hour range-slider timeline scrubber (`selectedHourOffset`) that
re-reads the *same* fetched field at a different hour — no re-fetch per
scrub.

## Optimal Wind (per waypoint)

Directly sourced from this project's own competitive research on onX
Hunt's "Optimal Wind" feature. `Waypoint.optimalWindDirections` (an array
of the 8 compass octants — 0/45/90/…/315° — the hunter marks as good wind
*from* for that spot) is editable from
`features/waypoints/components/WaypointEditPanel.tsx`. While the wind
layer is on, the panel shows the live reading nearest that waypoint and
whether it currently matches the saved octants
(`utils/windField.ts`'s `isOptimalWind()`, which snaps any live direction
to the nearest octant before comparing) — a green "matches" or red
"mismatch" badge, letting a hunter check *before* walking in whether
today's wind actually favors a stand instead of blowing their scent
toward where they expect deer to come from.

**Not verified live** (no map API key in this environment): the actual
rendered particle animation on a real map canvas. The math
(`utils/windField.ts`, 12 tests) and the store/UI wiring are fully
unit/integration tested instead, the same caveat as Phases 3/4/6's other
map-dependent visuals.
