# features/gps

**Status:** Phase 1, slice 1.3 done — live GPS position via the browser
Geolocation API. Heading/compass and the accuracy-circle overlay are not
built yet; a plain marker is shown instead.

`useGeolocation.ts` wraps `navigator.geolocation.watchPosition`, returning
a `DataPoint<Coordinate>` — a missing fix (no permission, denied,
unsupported, signal lost) is always `unavailable` with a reason, never a
guessed or stale-defaulted position, per the project's data-quality rule.

`components/GpsControl.tsx` is the floating "recenter on my position"
button used by `MapPage`; the position marker itself is drawn by
`MapInstance.setUserLocationMarker()` (`src/services/map/`), not by this
feature directly, keeping the map engine behind its adapter.

This hook has no dependency on the map — Phase 2 (waypoints) reuses it
directly for "use my current position" when creating a waypoint.
