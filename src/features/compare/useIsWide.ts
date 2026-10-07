import { useEffect, useState } from 'react'

/** Largeur à partir de laquelle la comparaison s'affiche en tableau. */
export const WIDE_QUERY = '(min-width: 1024px)'

function matches(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches
  } catch {
    return false
  }
}

/** `true` sur grand écran. Un seul rendu est monté (cartes OU tableau), pour
 * ne pas dupliquer le contenu dans le DOM. Hors navigateur : cartes. */
export function useIsWide(): boolean {
  const [wide, setWide] = useState(matches)
  useEffect(() => {
    let query: MediaQueryList
    try {
      query = window.matchMedia(WIDE_QUERY)
    } catch {
      return
    }
    const onChange = () => setWide(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}
