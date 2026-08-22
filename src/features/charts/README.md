# features/charts

**Status:** Phase 10 (Advanced Charts) complete.

`components/AdvancedChart.tsx` — real hourly temperature/wind/
precipitation from the already-fetched 48h forecast (`weatherStore`,
Phase 5), rendered as a hand-rolled SVG chart (no charting library
added — the project's minimal-dependency habit, and this app's needs
were simple enough not to justify one; `utils/chartScale.ts`'s
`scaleLinear`/`buildLinePath` are the only primitives needed).

- **Granularity** ("24h/12h/6h/3h/1h charts"): `utils/chartResampling.ts`'s
  `resampleHourly()` buckets real hours together — averaged for most
  fields, **summed** for precipitation (an hour-by-hour rain total
  averaged would understate it) — a real `calculated` value, never a
  fabricated one.
- **Pan**: the chart scrolls horizontally in its container (`overflow-x-
  auto`) at fine granularities, the same established pattern this app's
  hourly forecast strip already uses, rather than a custom drag gesture.
- **Cursor / hour selection**: click anywhere on the chart to move the
  shared timeline cursor. This reuses `windStore.selectedHourOffset`
  directly (see that store's own doc comment) instead of introducing a
  parallel "timeline" store — `windStore` already drove the Map page's
  wind layer hour, so extending its range from 24 to 48 (matching the
  real 48h both weather and wind now fetch) and having other features
  read/write it directly was the least-risk way to get one true shared
  cursor. Moving it here also moves the Map page's wind layer hour and
  (via `DayTimelineBar`'s new `selectedHour` prop) the Sun & Moon page's
  marker — "the time cursor synchronizes map, wind, weather, temporal
  data," verified live across all three pages.
- **Day comparison**: overlays day 1 (real hours 0-23) against day 2
  (real hours 24-47) of the same already-fetched forecast, aligned by
  hour-of-day. Real data — Open-Meteo's forecast API has no historical
  endpoint, so this compares the two real forecast days already fetched
  rather than fabricating a "past" comparison.

Verified live in-browser (no map API key needed for this page): the
chart renders real data, granularity switching and day-comparison work,
clicking the chart moves the cursor, and that same cursor's marker
appears on the Sun & Moon page's timeline bar, confirming the cross-page
sync actually works end to end.

### Visibility fix (user feedback on the deployed app)

Individual real readings — especially wind speed, which is the most
important one to be able to spot at a glance — were hard to make out on
mobile with a line alone; the chart also read as visually thin/cramped
at its original 200px height. Fixed by drawing a real circle marker at
every plotted hour on both the temperature and wind lines (not just the
connecting line), increasing the chart height, and widening the
precipitation bars — no data or scale changed, purely a legibility fix.
