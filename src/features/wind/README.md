# features/wind

**Status:** Phase 6 complete, then deliberately pushed past the bare
spec on user feedback ("do better — look at what onX Hunt, HuntStand,
iHunt, and weather apps like AccuWeather/Windy do") into a Windy-style
multi-layer weather map, plus a per-waypoint "Optimal Wind" feature and
an onX Hunt-style cross-waypoint wind comparison.

Provider: `src/services/wind/` (`WindProvider` interface,
`OpenMeteoWindProvider` implementation) — same keyless, free Open-Meteo
provider as `features/weather/`, requesting a **grid** of points in one
batched call (`buildGrid()` evenly spaces cell centers across the current
map bounds; Open-Meteo's comma-joined `latitude=`/`longitude=` batch
support and its top-level-array response shape were both verified live,
not assumed, before writing the normalization code). The same batched
call now also requests `temperature_2m`, `precipitation`, and
`cloud_cover` (the same real parameter names already verified live for
Phase 5's weather feature) alongside the wind parameters
(`wind_speed_10m`, `wind_direction_10m` — 0–360°, meteorological "from"
convention — `wind_gusts_10m`), so every map layer below rides one fetch.

## Windy-style multi-layer weather map

Verified via live research (windy.com/colors, Windy's community docs)
before building: Windy's signature look is a **calibrated, per-layer
color scale** plus particle trails proportional to speed — not just
particle motion alone. This app now does the same, entirely from the one
batched Open-Meteo grid fetch, no extra network calls:

- `utils/weatherMapColors.ts` — a real multi-stop color scale per layer
  (`weatherLayerColor()`), a matching legend gradient/bounds
  (`weatherLayerGradientCss()`, `LAYER_LEGEND`), and `valueForLayer()`
  mapping each layer to the real field it visualizes. These are
  deliberate *design* choices (which color means what), never fabricated
  *data* — every value colored is a genuine Open-Meteo reading.
- `MapLibreProvider.ts`'s `createWindLayer()` branches on the active
  layer: `'wind'` keeps the particle flow field (now colored by local
  speed, blue→red, matching Windy's own convention), while
  `'temperature' | 'precipitation' | 'clouds'` instead draw a smooth
  color-graded overlay — a soft radial gradient per real grid sample,
  blended together so the field reads as continuous rather than as
  isolated dots (still never an interpolated/fabricated value — only the
  *visual blending* is smoothed, each blob's color comes from one real
  sample).
- `components/WindLayerControl.tsx`'s layer switcher (Wind / Temperature
  / Precipitation / Clouds tabs) plus a legend bar under the readout —
  switching layers is instant, no re-fetch, since every layer already
  has its data from the one shared grid response.

## Flow-field animation

Per the project's own prior research (`NOTES_TECHNIQUES_FUTURES.md`:
"particle flow field, not a physics engine — visually sufficient, much
lighter"), the wind layer's animation is a lightweight particle system,
not a CFD simulation:

- `utils/windField.ts` is pure and framework-agnostic — `nearestSample()`
  picks the real grid sample closest to a coordinate (never interpolated
  between samples), `windAt()` looks up that sample's reading at a given
  hour offset, `advancePosition()` moves a point along a real wind vector
  for a timestep.
- The canvas itself lives entirely inside `MapLibreProvider.ts`
  (`createWindLayer()`) — `MapProvider.setWindField(field, hourOffset,
  layer)` is the only surface feature code touches, keeping the raw
  MapLibre engine out of `features/`. Particle speed is deliberately
  exaggerated for visual legibility — explicitly not physically accurate,
  matching the project's own design note above.

## UI

`state/windStore.ts` follows `weatherStore`'s "don't hammer the API"
pattern: fetching only happens on first enable (or an explicit "Refresh
for this area"), never automatically on every pan/zoom. Toggling the
layer off keeps the already-fetched field cached in memory rather than
discarding it, so re-enabling is instant. `activeLayer` is separate state
— switching it never touches `fetch`.

`components/WindLayerControl.tsx` is a floating toggle + bottom-sheet
panel: the layer tabs above, current reading for whichever layer is
active (a rotated compass icon + `compassLabel()`, reused from
`utils/terrain.ts`, for wind; a plain value + unit for the others), the
legend gradient bar, and a 24-hour range-slider timeline scrubber
(`selectedHourOffset`) that re-reads the *same* fetched field at a
different hour — no re-fetch per scrub, for any layer.

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

## Wind comparison (onX Hunt-style, `features/waypoints/`)

Verified via live research (onxmaps.com/hunt/tutorials/optimal-wind)
before building: onX Hunt's own differentiator here isn't just a
per-waypoint badge, it's a **"Wind Comparisons Tool"** — a side-by-side
view of wind across multiple waypoints at once. This app's version is
`features/waypoints/components/WindComparisonPanel.tsx`, shown on
`WaypointsPage`: every waypoint with a saved optimal-wind preference gets
a compact card with its live nearest reading and a match/mismatch badge,
all from the one `windStore.field` already fetched — letting a hunter
scan every stand's wind status at once instead of opening each one.

**Not verified live** (no map API key in this environment): the actual
rendered particle animation and color overlays on a real map canvas. The
math (`utils/windField.ts`, `utils/weatherMapColors.ts`) and the
store/UI wiring are fully unit/integration tested instead, the same
caveat as Phases 3/4/6's other map-dependent visuals.
