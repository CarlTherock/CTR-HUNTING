import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { installPermissionSpies } from '@/test/permissionSpies'
import { db } from '@/database/db'
import { getSetting } from '@/database/settingsRepository'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { ONBOARDING_SETTING_KEY, useOnboardingStore } from '../state/onboardingStore'
import { OnboardingDialog, ONBOARDING_STEPS } from './OnboardingDialog'

/**
 * Presentation screens. Every browser permission API is replaced by a spy:
 * the tests prove the presentation (and the home page it appears on) asks for
 * nothing, which is the product rule — permissions come when the function is
 * used.
 */
let permissions: ReturnType<typeof installPermissionSpies>

function resetStore() {
  useOnboardingStore.setState({
    loaded: false,
    completed: false,
    open: false,
    origin: null,
  })
}

function renderHomeWithDialog() {
  return render(
    <MemoryRouter>
      <OnboardingDialog />
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  resetStore()
  permissions = installPermissionSpies()
})

afterEach(async () => {
  permissions.restore()
  await db.settings.clear()
})

describe('onboarding', () => {
  it('control: the spies do catch a real position request (so the checks below mean something)', () => {
    const { unmount } = renderHook(() => useGeolocation())

    expect(permissions.watchPosition).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('opens on a first launch with the first of four screens', async () => {
    renderHomeWithDialog()

    const dialog = await screen.findByRole('dialog')
    expect(ONBOARDING_STEPS).toHaveLength(4)
    expect(dialog).toHaveAccessibleName('À quoi sert CTR Hunting')
    expect(screen.getByText(/Présentation · 1 sur 4/)).toBeVisible()
  })

  it('walks through the four screens and explains permissions without asking for any', async () => {
    const user = userEvent.setup()
    renderHomeWithDialog()
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Vos données restent sur votre appareil',
    )
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Pensez à sauvegarder')
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Les permissions : au moment utile',
    )
    expect(screen.getByText(/Rien n’est demandé maintenant/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Précédent' }))
    expect(screen.getByText(/Présentation · 3 sur 4/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    await user.click(screen.getByRole('button', { name: 'Terminer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    permissions.expectNoPermissionAsked()
  })

  it('can be skipped at any screen, and the choice is remembered in the settings', async () => {
    const user = userEvent.setup()
    renderHomeWithDialog()
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Passer' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(async () =>
      expect(await getSetting<string | null>(ONBOARDING_SETTING_KEY, null)).toEqual(
        expect.any(String),
      ),
    )
    permissions.expectNoPermissionAsked()
  })

  it('does not come back by itself once skipped (state read from the database)', async () => {
    const user = userEvent.setup()
    const first = renderHomeWithDialog()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await waitFor(async () =>
      expect(
        await getSetting<string | null>(ONBOARDING_SETTING_KEY, null),
      ).not.toBeNull(),
    )
    first.unmount()

    // A fresh session: in-memory state is gone, only IndexedDB remains.
    resetStore()
    renderHomeWithDialog()
    await waitFor(() => expect(useOnboardingStore.getState().loaded).toBe(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('can be replayed on demand and starts again at the first screen', async () => {
    const user = userEvent.setup()
    renderHomeWithDialog()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Suivant' }))
    await user.click(screen.getByRole('button', { name: 'Passer' }))

    act(() => useOnboardingStore.getState().replay())

    expect(await screen.findByRole('dialog')).toHaveAccessibleName(
      'À quoi sert CTR Hunting',
    )
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled()
  })

  it('never covers another page on a first launch (deep link, shared point): it waits for the home page', async () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <OnboardingDialog />
      </MemoryRouter>,
    )

    await act(() => useOnboardingStore.getState().load())

    expect(useOnboardingStore.getState().open).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a manual replay shows on any page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <OnboardingDialog />
      </MemoryRouter>,
    )

    act(() => useOnboardingStore.getState().replay())

    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('closes with Escape', async () => {
    const user = userEvent.setup()
    renderHomeWithDialog()
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not block the user when the saved state cannot be read', async () => {
    const spy = vi
      .spyOn(db.settings, 'get')
      .mockRejectedValue(new Error('base illisible'))
    renderHomeWithDialog()

    await waitFor(() => expect(useOnboardingStore.getState().loaded).toBe(true))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    spy.mockRestore()
  })

  it('survives a failed write: the presentation still closes', async () => {
    const user = userEvent.setup()
    renderHomeWithDialog()
    await screen.findByRole('dialog')
    const spy = vi.spyOn(db.settings, 'put').mockRejectedValue(new Error('quota'))

    await user.click(screen.getByRole('button', { name: 'Passer' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    spy.mockRestore()
  })
})
