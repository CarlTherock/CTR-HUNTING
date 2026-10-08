import { useEffect } from 'react'
import { useOnboardingStore } from './state/onboardingStore'

/** Opens the presentation on the very first visit. Called by the home page
 * only, so a deep link to another page is never covered by a dialog. */
export function useFirstRunOnboarding(): void {
  const load = useOnboardingStore((s) => s.load)
  useEffect(() => {
    void load()
  }, [load])
}
