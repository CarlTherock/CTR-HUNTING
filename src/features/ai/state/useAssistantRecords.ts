import { useEffect, useMemo } from 'react'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { AssistantRecords } from '../records'

export interface AssistantRecordsState {
  records: AssistantRecords
  /** Les quatre sources sont lues depuis l'appareil. */
  ready: boolean
}

/**
 * Lit (sans jamais modifier) les enregistrements de l'appareil via les
 * magasins existants, en les chargeant au besoin. L'objet renvoyé ne change
 * que si une des collections change : il sert de clé de mémoïsation.
 */
export function useAssistantRecords(): AssistantRecordsState {
  const waypoints = useWaypointsStore((s) => s.waypoints)
  const waypointsLoaded = useWaypointsStore((s) => s.loaded)
  const loadWaypoints = useWaypointsStore((s) => s.load)
  const tracks = useTracksStore((s) => s.tracks)
  const tracksLoaded = useTracksStore((s) => s.loaded)
  const loadTracks = useTracksStore((s) => s.load)
  const observations = useJournalStore((s) => s.observations)
  const journalLoaded = useJournalStore((s) => s.loaded)
  const loadJournal = useJournalStore((s) => s.load)
  const territories = useTerritoriesStore((s) => s.territories)
  const territoriesLoaded = useTerritoriesStore((s) => s.loaded)
  const loadTerritories = useTerritoriesStore((s) => s.load)

  useEffect(() => {
    if (!waypointsLoaded) void loadWaypoints()
    if (!tracksLoaded) void loadTracks()
    if (!journalLoaded) void loadJournal()
    if (!territoriesLoaded) void loadTerritories()
  }, [
    waypointsLoaded,
    tracksLoaded,
    journalLoaded,
    territoriesLoaded,
    loadWaypoints,
    loadTracks,
    loadJournal,
    loadTerritories,
  ])

  const records = useMemo<AssistantRecords>(
    () => ({ waypoints, tracks, observations, territories }),
    [waypoints, tracks, observations, territories],
  )
  return {
    records,
    ready: waypointsLoaded && tracksLoaded && journalLoaded && territoriesLoaded,
  }
}
