/**
 * Every piece of environmental or analytical data shown to the user must be
 * traceable to one of these origins. This is a hard project rule (see
 * project instructions: "Do not fabricate external data" / "Clearly
 * distinguish real data, calculated values, estimates and AI
 * interpretations") and is modeled as a type, not just a convention, so the
 * UI layer is forced to handle each case explicitly.
 */
export type DataConfidence =
  /** Directly reported by a sensor or provider (GPS fix, provider API value). */
  | 'measured'
  /** Derived deterministically from measured data (e.g. distance from GPS points). */
  | 'calculated'
  /** Modeled/interpolated by a provider or by us (e.g. forecast, terrain heuristic). */
  | 'estimated'
  /** Produced by an AI/assistant feature (Phase 14+); must always be labeled as such. */
  | 'ai_interpretation'
  /** Entered directly by the user in the field. */
  | 'user_observation'

/**
 * Wraps a value together with where it came from and whether it is even
 * available. Providers must represent gaps as `unavailable`, never as a
 * fabricated or silently-defaulted value.
 */
export type DataPoint<T> =
  | { status: 'available'; value: T; confidence: DataConfidence; source: string }
  | { status: 'unavailable'; reason?: string }
