/**
 * Persistent-storage request (`navigator.storage.persist()`).
 *
 * Asking the browser to mark this site's storage as « persistent » makes it
 * less likely to be evicted under storage pressure. It is a request, NOT a
 * guarantee: the browser decides (Safari/iOS in particular may refuse or
 * ignore it, and a user clearing site data always wins). The app therefore
 * only ever reports the actual answer and never promises protection — the
 * external backup file is what protects the data.
 *
 *  - `granted`     the browser says storage is persistent;
 *  - `denied`      the API exists but the answer is « no » (refused, or not
 *                  granted yet);
 *  - `unavailable` no `navigator.storage.persist` in this browser.
 */
export type PersistenceState = 'granted' | 'denied' | 'unavailable'

function storageApi(): StorageManager | null {
  if (typeof navigator === 'undefined') return null
  return navigator.storage ?? null
}

export async function getStoragePersistence(): Promise<PersistenceState> {
  const storage = storageApi()
  if (!storage || typeof storage.persisted !== 'function') return 'unavailable'
  try {
    return (await storage.persisted()) ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}

export async function requestStoragePersistence(): Promise<PersistenceState> {
  const storage = storageApi()
  if (!storage || typeof storage.persist !== 'function') return 'unavailable'
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted())) {
      return 'granted'
    }
    return (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}
