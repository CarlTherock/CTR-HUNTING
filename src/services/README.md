# services/

External integrations (map tile providers, weather providers, elevation
providers, etc.) live here **behind adapters**, never called directly from
feature code or components. This is a hard project rule: "Keep external APIs
behind service adapters" / "External providers must be replaceable."

Pattern each adapter should follow once its phase begins:

```text
src/services/weather/
  WeatherProvider.ts        # interface (the contract features depend on)
  OpenMeteoWeatherProvider.ts   # one concrete implementation
  index.ts                  # exports the interface + the configured instance
```

Features import the interface and the configured instance from the
feature's own `index.ts` re-export — never the concrete provider class
directly — so swapping providers later never touches feature code.

The map (`src/services/map/`, Phase 1), weather (`src/services/weather/`,
Phase 5), wind (`src/services/wind/`, Phase 6), and vegetation
(`src/services/vegetation/`, Phase 8) adapters exist now, each added when
its phase began, not before. Per the project's "never fabricate external
data" rule, `vegetationProvider` uses the Overpass API (OpenStreetMap)
rather than ESA WorldCover (no live point-query API exists) or USGS NLCD
(US-only, no coverage for this app's actual Quebec/Canada usage) — both
were checked live before picking Overpass.

`src/services/wind/OpenMeteoWindProvider.ts` also reuses Open-Meteo (same
keyless, free provider as weather), but fetches a whole **grid** of
points in one batched request (comma-joined `latitude=`/`longitude=`
lists — verified live against Open-Meteo's actual multi-location
response shape, a top-level array, before any code assumed it) rather
than a single point, since the flow-field animation needs real wind
samples spread across the visible map area, not just one location.
