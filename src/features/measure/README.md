# features/measure

**Status:** distance and area measuring tools on the map ("Outils" sheet →
« Mesurer une distance » / « Mesurer une surface »).

## Behaviour

- Taps on the map add points. The panel (bottom dock, collapsible, scrollable,
  controls >= 44 px) offers **Annuler** (last point), **Reprendre**, **Terminer**
  (locks the measurement and shows the summary), **Effacer** and **Quitter**.
- **Distance** (>= 2 points), three clearly labelled figures:
  - path length = sum of the geodesic segments (`totalDistanceMeters`, haversine);
  - bird-flight distance first -> last point;
  - 3D length, ONLY if `queryElevation` returns a real elevation for **every**
    point (loaded terrain); otherwise « indisponible : élévation non chargée ».
    It uses the elevation at the tapped vertices only, not along the segments.
- **Surface** (>= 3 points): geodesic area (hectares, m², acres), perimeter of
  the closed ring, and a warning « Polygone croisé : l'aire peut ne pas
  représenter la zone. » when two edges cross.
- Numbers are French (`12 345,6 m`, `3,45 ha`, `8,52 acres`): `utils/format.ts`.

## Maths (`utils/geo.ts`)

- Same sphere as `haversineMeters` (R = 6 371 km), so lengths and areas agree.
  The deviation from the WGS 84 ellipsoid is a few tenths of a percent.
- Area = sum, over the edges, of the signed spherical excess of the triangle
  (pole, p1, p2) (Bevis & Cambareri), edges being great-circle arcs. It never
  uses screen pixels nor a map projection (Web-Mercator would inflate areas
  by 1/cos² of the latitude: 4x at 60 deg N). Orientation does not matter.
- Reference values used in tests are computed independently (spherical band
  formula `R² · Δλ · (sin φ2 − sin φ1)`, the octant triangle `π R² / 2`, a
  Web-Mercator shoelace as a "wrong answer" counter-example).

## Architecture

- `state/measureStore.ts`: zustand, in memory only. **Measurements are ephemeral:
  nothing is written to IndexedDB, no table, and the UI says so.**
- `measureSummary.ts`: pure summaries (no React).
- Map drawing goes through the adapter: `MapInstance.setMeasureShape` (own
  teal source/layers, independent of the elevation profile's `setMeasurePath`).
  The drawing is cleared when the map unmounts.
- One tap mode at a time (`useMeasureExclusivity`, `startMeasure`): starting a
  measure cancels waypoint placement, altitude query, elevation profile and
  spot analysis; when one of those (or an open waypoint draft) takes over, the
  measure **pauses** (drawing kept, « En pause », « Reprendre »). Field Mode
  closes it.

## Deferred

- **Scent cone: deferred** — its uncertainty (wind variability, terrain, scent
  dispersion) cannot be drawn honestly without a validated model, so it is not
  part of this slice.

## Limits

- Elevation comes from the loaded DEM (3D terrain on); with the relief off the
  3D length is unavailable by design.
- Spherical model: not survey-grade; a polygon spanning the antimeridian is
  handled but not a priority; a self-crossing polygon has no meaningful area.
