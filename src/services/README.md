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

The map (`src/services/map/`, Phase 1) and weather (`src/services/weather/`,
Phase 5) adapters exist now, each added when its phase began, not before.
Wind (Phase 6) and elevation providers get their own adapter the same way,
per the project's "never fabricate external data, never build ahead of the
roadmap" rules.
