import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'

export const INSTALL_DISMISSED_KEY = 'installPromptDismissedAt'

/** The non-standard `beforeinstallprompt` event (Chromium on Android/desktop). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface InstallState {
  /** Captured install event; only ever set when the browser really fired it. */
  deferredPrompt: BeforeInstallPromptEvent | null
  dismissed: boolean
  loaded: boolean

  /** Starts listening for the install event. Idempotent; call it as early as
   * possible (the event can fire before any screen is mounted). */
  listen: () => void
  load: () => Promise<void>
  /** Asks the browser to show its own install dialog (Android/desktop). */
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>
  /** « Plus tard » / close: remembered, the invitation does not come back. */
  dismiss: () => void
}

let listening = false

export const useInstallStore = create<InstallState>((set, get) => ({
  deferredPrompt: null,
  dismissed: false,
  loaded: false,

  listen: () => {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('beforeinstallprompt', (event) => {
      // Keep the event so the install dialog can be opened from our own button.
      event.preventDefault()
      set({ deferredPrompt: event as BeforeInstallPromptEvent })
    })
    window.addEventListener('appinstalled', () => set({ deferredPrompt: null }))
  },

  load: async () => {
    if (get().loaded) return
    try {
      const at = await getSetting<string | null>(INSTALL_DISMISSED_KEY, null)
      set({ loaded: true, dismissed: typeof at === 'string' && at.length > 0 })
    } catch {
      // Unreadable: do not nag, do not block.
      set({ loaded: true, dismissed: true })
    }
  },

  install: async () => {
    const event = get().deferredPrompt
    if (!event) return 'unavailable'
    // The event can be used only once.
    set({ deferredPrompt: null })
    try {
      await event.prompt()
      const choice = await event.userChoice
      if (choice.outcome === 'dismissed') get().dismiss()
      return choice.outcome
    } catch {
      return 'unavailable'
    }
  },

  dismiss: () => {
    set({ dismissed: true })
    void setSetting(INSTALL_DISMISSED_KEY, new Date().toISOString()).catch(
      () => undefined,
    )
  },
}))

/** Test helper: lets a test register the window listeners again. */
export function resetInstallListenerForTests(): void {
  listening = false
}
