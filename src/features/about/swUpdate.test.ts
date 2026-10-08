import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForServiceWorkerUpdate, readServiceWorkerInfo } from './swUpdate'

/**
 * A fake service-worker container: this proves the logic that reads the
 * EXISTING registration and asks it to update, not what a real browser does
 * with a real worker.
 */
interface FakeRegistration {
  active: { state: ServiceWorkerState } | null
  installing: object | null
  waiting: object | null
  update: ReturnType<typeof vi.fn>
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

function fakeRegistration(overrides: Partial<FakeRegistration> = {}) {
  const listeners = new Set<() => void>()
  const registration: FakeRegistration = {
    active: { state: 'activated' },
    installing: null,
    waiting: null,
    update: vi.fn().mockResolvedValue(undefined),
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
    ...overrides,
  }
  return { registration, fireUpdateFound: () => listeners.forEach((l) => l()), listeners }
}

function installContainer(registration: FakeRegistration | undefined, controller = {}) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      controller,
      register: vi.fn(),
    },
  })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  vi.useRealTimers()
})

describe('readServiceWorkerInfo', () => {
  it('reports an unsupported browser', async () => {
    expect(await readServiceWorkerInfo()).toMatchObject({
      supported: false,
      registered: false,
    })
  })

  it('reports no registration (development, or before the first visit ends)', async () => {
    installContainer(undefined)
    expect(await readServiceWorkerInfo()).toMatchObject({
      supported: true,
      registered: false,
    })
  })

  it('reports an active worker that controls the page', async () => {
    installContainer(fakeRegistration().registration)
    expect(await readServiceWorkerInfo()).toEqual({
      supported: true,
      registered: true,
      controlled: true,
      state: 'activated',
      updatePending: false,
    })
  })

  it('flags a worker that is installing', async () => {
    installContainer(fakeRegistration({ installing: {} }).registration)
    expect((await readServiceWorkerInfo()).updatePending).toBe(true)
  })
})

describe('checkForServiceWorkerUpdate', () => {
  it('only asks the existing registration to update; it never registers or unregisters', async () => {
    const { registration } = fakeRegistration()
    installContainer(registration)

    const result = await checkForServiceWorkerUpdate(0)

    expect(registration.update).toHaveBeenCalledTimes(1)
    expect(result).toBe('up-to-date')
    expect(navigator.serviceWorker.register).not.toHaveBeenCalled()
  })

  it('finds an update announced by the browser while updating', async () => {
    const { registration, fireUpdateFound } = fakeRegistration()
    registration.update.mockImplementation(async () => fireUpdateFound())
    installContainer(registration)

    expect(await checkForServiceWorkerUpdate(0)).toBe('update-found')
  })

  it('finds an update that appears just after update() resolves', async () => {
    vi.useFakeTimers()
    const { registration } = fakeRegistration()
    installContainer(registration)

    const pending = checkForServiceWorkerUpdate(1500)
    await vi.advanceTimersByTimeAsync(100)
    registration.installing = {}
    await vi.advanceTimersByTimeAsync(1500)

    expect(await pending).toBe('update-found')
  })

  it('says so when there is nothing to update', async () => {
    installContainer(undefined)
    expect(await checkForServiceWorkerUpdate(0)).toBe('not-registered')
  })

  it('says so when the browser has no service worker', async () => {
    expect(await checkForServiceWorkerUpdate(0)).toBe('unsupported')
  })

  it('reports a failed check as an error, never as « up to date »', async () => {
    const { registration, listeners } = fakeRegistration()
    registration.update.mockRejectedValue(new TypeError('Failed to fetch'))
    installContainer(registration)

    expect(await checkForServiceWorkerUpdate(0)).toBe('error')
    expect(listeners.size).toBe(0)
  })
})
