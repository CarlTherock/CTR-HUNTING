# Architecture

This document describes the architecture actually implemented in this
repository. It is updated every phase. See `PROJECT_SPECIFICATION.md` for
the product roadmap and rules this architecture serves.

## Layering

```
UI (components, pages)
  ↓
Feature logic (src/features/<name>)
  ↓
Domain/services (src/services — external API adapters)
  ↓
Repositories (src/database — Dexie-backed data access)
  ↓
Local data (IndexedDB) / remote data (future, Phase 15)
```

React components render and dispatch; they do not contain business rules.
Business rules live in feature modules and services; persistence lives in
repositories. This is enforced by convention and code review today — no
lint rule blocks a component from importing Dexie directly yet, so this is
the first thing to check in review as features gain real logic in Phase 1+.

## Directory layout

```text
field-terrain-intelligence/
├── README.md
├── PROJECT_SPECIFICATION.md
├── ARCHITECTURE.md            (this file)
├── CHANGELOG.md
├── .env.example
├── .gitignore
├── package.json
├── vite.config.ts             Vite + Tailwind + PWA + Vitest config (single file, per Vite convention)
├── eslint.config.js
├── .prettierrc.json
│
├── public/                    Static assets served as-is (icons, favicon)
│
├── src/
│   ├── app/                   App composition root
│   │   ├── App.tsx              Router provider
│   │   ├── routes.tsx            Route table
│   │   └── navigation.ts         Single source of truth for the app's IA (nav items, icons, target phase)
│   │
│   ├── components/
│   │   ├── layout/             AppShell, Sidebar (desktop), BottomNav (mobile), TopBar, ConnectionStatus
│   │   └── ui/                  Design-system primitives: Button, Card, Badge, EmptyState, PageHeader, PhasePlaceholder
│   │
│   ├── features/               One folder per product feature (see below)
│   │
│   ├── services/                External API adapters — map/ (Phase 1: MapProvider, MapTilerProvider); see services/README.md
│   ├── database/                Dexie database + repositories (local persistence)
│   ├── offline/                 Connectivity/offline primitives (useOnlineStatus)
│   ├── workers/                 Web Workers for heavy computation (empty in Phase 0)
│   ├── types/                   Shared domain types (Coordinate, Waypoint, Track, WeatherSnapshot, DataConfidence, ...)
│   ├── utils/                   Small framework-free helpers (cn, ...)
│   └── test/                    Vitest setup (jsdom polyfills, fake-indexeddb)
│
└── (tests are co-located as *.test.ts/tsx next to the code they cover —
     see "Testing strategy" below for why, and where Phase 16 e2e tests go)
```

### Feature folders

Every folder under `src/features/` corresponds 1:1 to a roadmap phase (or a
closely related pair of phases). In Phase 0, only `dashboard/` and
`settings/` are functional; every other feature folder contains a
`README.md` documenting its scope and target phase, and — if it's reachable
from the current navigation — a `pages/<Name>Page.tsx` placeholder built
from the shared `<PhasePlaceholder>` component so the shell, routing and
design system are exercised end-to-end before any real feature logic
exists.

This is a deliberate Phase 0 choice: it proves the architecture (routing →
layout → feature page → design system) works for every planned section
without writing any feature logic ahead of its phase, which the project
rules explicitly forbid.

| Folder                                   | Phase | Phase 0 state                                                |
| ---------------------------------------- | ----- | ------------------------------------------------------------ |
| `dashboard/`                             | 0     | Functional — landing page, roadmap status                    |
| `settings/`                              | 0     | Functional (minimal) — connectivity + local DB check + about |
| `map/`                                   | 1     | Functional (slice 1.1) — interactive base map, pan/zoom      |
| `layers/`                                | 1     | Functional (slices 1.2, 1.4) — base layer switcher + overlay toggles |
| `gps/`                                   | 1     | Functional (slice 1.3) — live position via Geolocation API   |
| `waypoints/`                             | 2     | Placeholder page                                             |
| `tracks/`                                | 2     | README only                                                  |
| `offline/` (feature, not `src/offline/`) | 3     | README only                                                  |
| `terrain/`                               | 4     | README only                                                  |
| `weather/`                               | 5     | Placeholder page                                             |
| `wind/`                                  | 6     | README only                                                  |
| `astronomy/`                             | 7     | README only                                                  |
| `analytics/`                             | 8–9   | Placeholder page (routed as "Terrain Analysis")              |
| `camera/`                                | 12    | README only                                                  |
| `photos/`                                | 12    | README only                                                  |
| `journal/`                               | 13    | Placeholder page                                             |
| `observations/`                          | 13    | README only                                                  |
| `history/`                               | 13    | README only                                                  |
| `ai/`                                    | 14    | README only                                                  |

Note: `journal/` is not in the original file-structure sketch in the
planning material (which lists `observations/` and `history/` but not a
dedicated `journal/`); it was added because Phase 13 is explicitly named
"Journal" in the roadmap and needs a single feature home for its page,
composed from `observations/`, `photos/` and `history/`. This is the kind
of structural decision the project rules require documenting — noted here
rather than made silently.

## Data layer (offline-first)

`src/database/db.ts` defines a single Dexie database
(`field-terrain-intelligence`) with tables for `waypoints`, `tracks`,
`observations`, a generic `settings` key/value table, and a `syncQueue`
table reserved for Phase 15. This is the one database both the mobile and
desktop layouts read from, which is how "both experiences use the same
data" (per the spec) is satisfied without a backend.

Only `settingsRepository.ts` exists as a repository today — a thin
get/set wrapper the Settings page already uses for a real (not mocked)
offline read/write. Feature-specific repositories (`waypointsRepository`,
`tracksRepository`, ...) are added in the phase that owns them, following
the same pattern, rather than being stubbed out now.

`src/offline/useOnlineStatus.ts` wraps `navigator.onLine` with
`useSyncExternalStore` so any component can react to connectivity changes.
It reflects link state only, not per-provider reachability — that
distinction matters once real network calls exist from Phase 1 on, and each
service adapter will need its own failure handling on top of this signal.

## PWA / offline shell

`vite-plugin-pwa` (Workbox, `generateSW` mode) precaches the app shell
(JS/CSS/HTML/icons) so the app loads with no network after first visit.
Runtime caching strategies for map tiles and other large, on-demand assets
are explicitly deferred to Phase 3 (Offline) — Phase 0 only proves the
shell itself is installable and offline-launchable.

## Design system

Tailwind v4's CSS-first `@theme` (in `src/index.css`) defines the token
set: a dark-first surface scale, an ink (text) scale, a green "brand"
accent, and semantic status colors. Dark-first was chosen because the app
is primarily used outdoors in bright sun or low light, where a dark UI with
high-contrast accents stays legible; a light theme is not ruled out for
later but is not the Phase 0 priority.

`src/components/ui/` holds framework-agnostic primitives (Button, Card,
Badge, EmptyState, PageHeader) that every feature page builds on, plus
`PhasePlaceholder`, which is specific to this pre-launch period and will be
deleted feature-by-feature as each phase replaces its placeholder with real
UI.

## Responsive layout

`AppShell` renders a persistent `Sidebar` on `md+` viewports and a
`TopBar` + fixed `BottomNav` below it — both driven by the same
`navigation.ts` config, so a feature only has to be added to one place to
appear correctly in both layouts. The bottom nav intentionally shows only
`primary` items (5, in Phase 0) to keep touch targets large for one-handed
field use; the sidebar shows the full information architecture.

## Testing strategy

Vitest + Testing Library, `jsdom` environment, tests co-located next to the
code they cover (`Button.test.tsx` beside `Button.tsx`, etc.) rather than
in a separate mirror tree — this keeps a test next to the file it breaks
when that file changes, which matters more at this size than matching the
`tests/` folder sketched in the early planning material. A future Phase 16
(Testing & Optimization) is where Playwright end-to-end tests are added,
and a top-level `tests/` (or `e2e/`) directory is introduced at that point
for that purpose specifically.

`fake-indexeddb` polyfills IndexedDB in `jsdom` so Dexie-backed persistence
is tested for real, not mocked.

Phase 0 coverage, mapped to the project's minimum testing list:

| Required area       | Phase 0 coverage                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Application startup | `src/app/App.test.tsx`                                                                                             |
| Map initialization  | Not applicable yet — `MapPage` is a placeholder; a real test is added in Phase 1 when there is a map to initialize |
| GPS                 | Not applicable yet — no GPS code exists; added in Phase 1/2                                                        |
| Waypoint creation   | Not applicable yet — no waypoint feature exists; added in Phase 2                                                  |
| Local persistence   | `src/database/settingsRepository.test.ts` (real IndexedDB round-trip)                                              |
| Offline behavior    | `src/offline/useOnlineStatus.test.ts`                                                                              |
| Synchronization     | Not applicable yet — Phase 15                                                                                      |
| Important analytics | Not applicable yet — Phase 8                                                                                       |

Testing a placeholder page beyond "it renders and is labeled as not built"
would produce tests that assert nothing meaningful; those are added when
the corresponding feature exists, not before.

## Path alias

`@/*` resolves to `src/*` (configured in `tsconfig.app.json` and mirrored in
`vite.config.ts`'s `resolve.alias`) to keep feature-to-shared imports short
and refactor-safe as the tree grows.

## Decisions log

| Decision                                   | Reason                                                                                                                                                                                                                       |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tailwind v4 (`@tailwindcss/vite`) over v3  | No separate PostCSS config needed; CSS-first `@theme` keeps design tokens in one file (`index.css`) instead of a parallel `tailwind.config.ts`.                                                                              |
| `react-router-dom` v7 added in Phase 0     | Navigation/shell is explicitly in Phase 0 scope; a real router is simpler than hand-rolling one and is replaceable later if needed.                                                                                          |
| `dexie` added in Phase 0                   | Offline architecture prep is explicit Phase 0 scope; Dexie gives typed IndexedDB access without hand-writing the IDB API.                                                                                                    |
| `lucide-react` added in Phase 0            | Nav/shell needs a consistent icon set to look like the professional product described in the spec, not a text-only nav. Tree-shakeable, no runtime cost beyond icons actually imported.                                      |
| No `zustand`/`tanstack-query` yet          | Nothing in Phase 0 needs cross-component client state or server-cache management; adding them now would be an unused dependency. Introduced when a feature (Phase 1 map state, Phase 5 weather fetching) actually needs one. |
| No `clsx`/`tailwind-merge`                 | `src/utils/cn.ts` (≈15 lines) covers every current need; avoids two dependencies for a problem this small. Revisit if class-conflict resolution becomes actually necessary.                                                  |
| Tests co-located, not in `tests/`          | Faster to find/maintain per-file; `tests/` (or `e2e/`) is introduced specifically for Phase 16 Playwright suites, where a separate top-level tree is the norm.                                                               |
| `baseUrl` omitted from `tsconfig.app.json` | The TypeScript toolchain in this environment deprecates `baseUrl` in bundler mode; `paths` alone resolves correctly relative to the tsconfig file. |
| MapTiler as the map tile provider (Phase 1, slice 1.1) | Free tier is sufficient for development; the "Outdoor" style bundles satellite, topographic and contour rendering in one style URL instead of three separate ones. Its terrain-RGB tiles are reused for elevation in Phase 4 (3D terrain) and Phase 8 (Analytics Engine), avoiding a second elevation provider until one is actually needed. Hidden entirely behind `MapProvider`/`MapTilerProvider` (`src/services/map/`), so swapping providers later touches one file, not feature code.                                                                                                                                    |
| `zustand` for map viewport state (Phase 1, slice 1.1) | The viewport (center/zoom/pitch/bearing) is ephemeral state read and driven by multiple decoupled components — the map today, and per the roadmap later the layer manager, GPS recenter action, and the Phase 10 timeline cursor that must synchronize map/weather/wind/temporal views. Component state/context doesn't fit that fan-out; a lightweight external store does. This is the point the earlier "no zustand yet" decision (above) said would justify adding it.                                                                           |

## Known limitations (Phase 0)

- No map, GPS, weather, or any external data source is wired up — every
  non-dashboard/settings page is an explicitly labeled placeholder.
- Production bundle is ~396 KB (~127 KB gzipped) for an app with no feature
  code yet, mostly `react-dom` + `react-router-dom` + `lucide-react` +
  `dexie`. No code-splitting/route-based chunking has been set up; revisit
  once `MapLibre GL` (Phase 1) is added, since that will dominate bundle
  size regardless.
- PWA icons are placeholder-generated (solid color + "FTI" monogram), not
  final brand assets — swap in Phase 17 (visual identity) or sooner if
  branding is decided earlier.
- No CI pipeline is configured yet; `npm run typecheck && npm run lint &&
npm run test && npm run build` must be run locally before considering a
  change complete.
