# features/weather

**Status:** placeholder UI only — full implementation planned for **Phase 5**.

Temperature, humidity, pressure, precipitation, cloud cover, visibility and
hourly forecast, sourced through a replaceable provider adapter
(`src/services/weather/`, added in Phase 5). Wind is a dedicated sibling
module (`features/wind/`, Phase 6). Never fabricates data — see
`src/types/data-quality.ts`.
