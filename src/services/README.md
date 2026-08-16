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

No adapters exist yet in Phase 0: the map (Phase 1), weather (Phase 5), wind
(Phase 6) and elevation providers all get their own adapter when their phase
is implemented, per the project's "never fabricate external data, never
build ahead of the roadmap" rules.
