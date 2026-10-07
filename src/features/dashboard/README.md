# features/dashboard

**Status:** functional.

Field home page (`/`). Compact cards fed by existing stores, never by new
requests at launch: weather and wind (real data only, "actuel" or "prévision"
with the hour, otherwise "indisponible" and a button), map shortcut, active
guidance, selected territory, last outing, offline maps, data and backup
state. Pure helpers (ages, last outing, offline counts, weather summary) live
in `summary.ts`. The developer roadmap moved to `/about`.
