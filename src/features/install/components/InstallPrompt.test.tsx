import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '@/database/db'
import { getSetting } from '@/database/settingsRepository'
import {
  INSTALL_DISMISSED_KEY,
  resetInstallListenerForTests,
  useInstallStore,
  type BeforeInstallPromptEvent,
} from '../state/installStore'
import { InstallPrompt } from './InstallPrompt'

/**
 * The install invitation. `beforeinstallprompt` and the iPhone user agent are
 * SIMULATED: this proves when the component appears, not that a real browser
 * offers installation (that needs a physical device).
 */
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value })
}

function setStandalone(display: boolean, ios = false) {
  window.matchMedia = ((query: string) => ({
    matches: display && query === '(display-mode: standalone)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(navigator, 'standalone', {
    configurable: true,
    value: ios ? true : undefined,
  })
}

function fireInstallEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event &
    Partial<BeforeInstallPromptEvent>
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome, platform: 'web' })
  act(() => {
    window.dispatchEvent(event)
  })
  return event as BeforeInstallPromptEvent
}

function renderPrompt() {
  return render(
    <MemoryRouter>
      <InstallPrompt />
    </MemoryRouter>,
  )
}

const originalMatchMedia = window.matchMedia
const originalUserAgent = navigator.userAgent

beforeEach(() => {
  resetInstallListenerForTests()
  useInstallStore.setState({ deferredPrompt: null, dismissed: false, loaded: false })
  setStandalone(false)
})

afterEach(async () => {
  window.matchMedia = originalMatchMedia
  setUserAgent(originalUserAgent)
  Reflect.deleteProperty(navigator, 'standalone')
  await db.settings.clear()
})

describe('InstallPrompt', () => {
  it('does not appear on an ordinary browser without an install event', async () => {
    renderPrompt()

    await waitFor(() => expect(useInstallStore.getState().loaded).toBe(true))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('appears when the browser fires beforeinstallprompt, and opens the browser dialog on click', async () => {
    const user = userEvent.setup()
    renderPrompt()
    await waitFor(() => expect(useInstallStore.getState().loaded).toBe(true))

    const event = fireInstallEvent('accepted')

    expect(event.defaultPrevented).toBe(true)
    const region = await screen.findByRole('region', { name: 'Installer l’application' })
    await user.click(screen.getByRole('button', { name: 'Installer' }))

    expect(event.prompt).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(region).not.toBeInTheDocument())
  })

  it('remembers a refusal made in the browser dialog', async () => {
    const user = userEvent.setup()
    renderPrompt()
    await waitFor(() => expect(useInstallStore.getState().loaded).toBe(true))
    fireInstallEvent('dismissed')

    await user.click(await screen.findByRole('button', { name: 'Installer' }))

    await waitFor(async () =>
      expect(await getSetting<string | null>(INSTALL_DISMISSED_KEY, null)).not.toBeNull(),
    )
  })

  it('shows the manual steps on an iPhone where the app is not installed', async () => {
    setUserAgent(IPHONE_UA)
    renderPrompt()

    const region = await screen.findByRole('region', { name: 'Installer l’application' })
    expect(region).toHaveTextContent('Sur l’écran d’accueil')
    expect(region).toHaveTextContent('Partager')
    expect(screen.queryByRole('button', { name: 'Installer' })).not.toBeInTheDocument()
  })

  it('does not appear once installed (iOS standalone flag)', async () => {
    setUserAgent(IPHONE_UA)
    setStandalone(false, true)
    renderPrompt()

    await waitFor(() => expect(useInstallStore.getState().loaded).toBe(true))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('does not appear once installed (display-mode standalone), even with an install event', async () => {
    setStandalone(true)
    renderPrompt()
    await waitFor(() => expect(useInstallStore.getState().loaded).toBe(true))

    fireInstallEvent()

    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('can be closed and does not return after a reload', async () => {
    const user = userEvent.setup()
    setUserAgent(IPHONE_UA)
    const first = renderPrompt()
    await screen.findByRole('region', { name: 'Installer l’application' })

    await user.click(
      screen.getByRole('button', { name: 'Fermer l’invitation à installer' }),
    )
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    await waitFor(async () =>
      expect(await getSetting<string | null>(INSTALL_DISMISSED_KEY, null)).not.toBeNull(),
    )
    first.unmount()

    useInstallStore.setState({ dismissed: false, loaded: false })
    renderPrompt()
    await waitFor(() => expect(useInstallStore.getState().loaded).toBe(true))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('does not nag when the saved choice cannot be read', async () => {
    setUserAgent(IPHONE_UA)
    const spy = vi.spyOn(db.settings, 'get').mockRejectedValue(new Error('illisible'))
    renderPrompt()

    await waitFor(() => expect(useInstallStore.getState().loaded).toBe(true))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    spy.mockRestore()
  })
})
