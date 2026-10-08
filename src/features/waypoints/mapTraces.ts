import type { MapTrace } from '@/services/map/MapProvider'
import type { Track, TrackPoint } from '@/types'
import {
  matchesTrackFilter,
  trackDisplayColor,
  trackKind,
  type TrackFilter,
} from './trackStyle'

export interface LiveRecording {
  id: string
  points: readonly TrackPoint[]
  breaks: readonly number[]
}

/** The traces to draw: every stored track that passes the filter, with the
 * in-progress one replaced by its live points (the stored copy is only as
 * recent as the last write). Colours come from the track itself — an old
 * track is never recoloured. */
export function buildMapTraces(
  tracks: readonly Track[],
  filter: TrackFilter,
  live: LiveRecording | null,
): MapTrace[] {
  return tracks
    .filter((track) => matchesTrackFilter(track, filter))
    .map((track) => {
      const isLive = live !== null && live.id === track.id
      return {
        id: track.id,
        kind: trackKind(track),
        color: trackDisplayColor(track),
        points: isLive ? live.points : track.points,
        breaks: isLive ? live.breaks : (track.breaks ?? []),
      }
    })
}
