# features/weather

**Status:** Phase 5 complete — current conditions, hourly forecast, and
offline fallback to the last successful reading.

Provider: `src/services/weather/` (`WeatherProvider` interface,
`OpenMeteoWeatherProvider` implementation) — [Open-Meteo](https://open-meteo.com),
chosen because it needs **no API key** (verified live against its docs:
free/non-commercial use requires no `apikey` param, ~10,000 calls/day
limit) — unlike the Phase 1 map providers, there's no key-management step
for this one at all. Every parameter name (`temperature_2m`,
`relative_humidity_2m`, `wind_gusts_10m`, etc.) was verified against
Open-Meteo's live docs before being hard-coded, per the project's "never
fabricate a technical fact" rule.

One deliberate wrinkle: Open-Meteo's `current=` block doesn't include
visibility natively (confirmed via their docs — it's an `hourly=`-only
variable), so `OpenMeteoWeatherProvider` sources current visibility from
the first hourly sample instead of leaving it out or guessing a value.

`state/weatherStore.ts` fetches once on mount (GPS if already fixed,
otherwise the map's last known center — flagged in the UI when it's the
fallback) and again once if a GPS fix arrives afterward, but **not** on
every subsequent GPS update — that would hammer the free API on ordinary
GPS jitter. A manual refresh button covers "I've actually moved." Every
successful fetch is cached via `settingsRepository` (Dexie); if a later
fetch fails (offline, provider down), the store falls back to that cached
reading and clearly flags it (`isCached` + the original error reason),
never silently presenting stale data as fresh.

Wind gets its own dedicated engine (direction, animation, interactive
timeline) in Phase 6 — this page only shows wind speed/gusts as one
metric among the others, matching the phase split in
`PROJECT_SPECIFICATION.md`.

Verified live in-browser (Open-Meteo needing no key made this possible,
unlike Phases 3/4's map-dependent features): real current conditions and
a scrollable 24h hourly forecast render correctly, and the Dexie cache
write was confirmed directly.
