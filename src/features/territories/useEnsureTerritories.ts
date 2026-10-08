import { useEffect } from 'react'
import { useTerritoriesStore } from './state/territoriesStore'

/** Loads territories (and the saved filter) once per session. Safe to call
 * from every page that shows territory-aware content. */
export function useEnsureTerritories(): void {
  const loaded = useTerritoriesStore((state) => state.loaded)
  const load = useTerritoriesStore((state) => state.load)
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
}
