import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { version } from '../../../../package.json'
import { APP_VERSION } from '@/app/appInfo'
import { PROVIDER_HOSTS } from '../../../../build/csp'
import { NETWORK_PROVIDERS } from '@/features/privacy/networkProviders'
import { ROADMAP } from '../roadmap'
import AboutPage from './AboutPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  )
}

function section(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`section #${id} introuvable`)
  return element
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('AboutPage', () => {
  it('shows the version read from package.json, not a typed constant', () => {
    renderPage()

    expect(APP_VERSION).toBe(version)
    expect(section('version')).toHaveTextContent(`version ${version}`)
    expect(section('version')).toHaveTextContent(/compilée le/)
  })

  it('shows the build moment with its time zone, not a bare date', () => {
    renderPage()

    expect(section('version')).toHaveTextContent(/fuseau .+UTC[+-]\d{2}:\d{2}/)
  })

  it('offers an opt-in, copyable display diagnostic that measures nothing until asked', async () => {
    const user = userEvent.setup()
    renderPage()
    const block = section('diagnostic-affichage')

    expect(screen.queryByTestId('display-diagnostic')).toBeNull()
    await user.click(
      within(block).getByRole('button', { name: 'Afficher le diagnostic' }),
    )

    const report = screen.getByTestId('display-diagnostic')
    expect(report).toHaveTextContent('Zones sûres')
    expect(report).toHaveTextContent('Aucune position, aucune clé')
    expect(
      within(block).getByRole('button', { name: 'Copier le diagnostic' }),
    ).toBeVisible()
  })

  it('states that accounts, subscriptions and payment are not available', () => {
    renderPage()

    expect(section('version')).toHaveTextContent(
      'Comptes, abonnements et paiement : non disponibles / reportés',
    )
  })

  it('does not mark phases 14, 15, 16 or 17 as finished and points to the progress page', () => {
    renderPage()

    for (const phase of [14, 15, 16, 17]) {
      const entry = ROADMAP.find((p) => p.phase === phase)
      expect(entry?.status, `phase ${phase}`).not.toBe('done')
    }
    const phases = section('phases')
    expect(
      within(phases).getByRole('link', { name: /Projet et progression/ }),
    ).toHaveAttribute('href', '/project')
    expect(phases).toHaveTextContent(/ne sont pas terminées/)
  })

  it('credits exactly the services the code uses, matching the CSP allow-list', () => {
    renderPage()

    const sources = section('sources')
    for (const provider of NETWORK_PROVIDERS) {
      expect(sources).toHaveTextContent(provider.name)
    }
    expect(NETWORK_PROVIDERS.flatMap((p) => p.hosts).sort()).toEqual(
      [...PROVIDER_HOSTS].sort(),
    )
    // Services the code does not call must not be credited.
    expect(sources.textContent).not.toMatch(/RainViewer|Mapbox|Google Maps/i)
    expect(sources).toHaveTextContent('OpenStreetMap')
    expect(sources).toHaveTextContent('Open-Meteo')
    expect(sources).toHaveTextContent('CC-BY 4.0')
    expect(
      within(sources).getByRole('link', { name: 'docs/SOURCES_QUEBEC.md' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/carltherock/ctr-hunting/blob/main/docs/SOURCES_QUEBEC.md',
    )
  })

  it('links the repository documentation, opening in a new tab safely', () => {
    renderPage()

    const links = within(section('documentation')).getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(8)
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(
        /^https:\/\/github\.com\/carltherock\/ctr-hunting\/blob\/main\//,
      )
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
    }
  })

  it('describes how updates apply (autoUpdate: new worker active, open page keeps old code)', () => {
    renderPage()

    const update = section('mise-a-jour')
    expect(update).toHaveTextContent(/automatiquement/)
    expect(update).toHaveTextContent(/page déjà ouverte garde l’ancien code/)
  })

  it('checks for an update through the existing service worker only, and offers a reload when found', async () => {
    const user = userEvent.setup()
    const listeners = new Set<() => void>()
    const registration = {
      active: { state: 'activated' },
      installing: null,
      waiting: null,
      update: vi.fn().mockImplementation(async () => listeners.forEach((l) => l())),
      addEventListener: (_t: string, l: () => void) => listeners.add(l),
      removeEventListener: (_t: string, l: () => void) => listeners.delete(l),
    }
    const register = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(registration),
        controller: {},
        register,
      },
    })
    renderPage()
    expect(await screen.findByText(/actif \(activated\)/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Rechercher une mise à jour' }))

    expect(await screen.findByText(/Une nouvelle version a été trouvée/)).toBeVisible()
    expect(registration.update).toHaveBeenCalledTimes(1)
    expect(register).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Recharger maintenant' })).toBeVisible()
  })

  it('says honestly that no worker is active when there is none', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined), controller: null },
    })
    renderPage()
    expect(await screen.findByText('non actif')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Rechercher une mise à jour' }))

    expect(await screen.findByText(/Aucun service worker n’est actif/)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Recharger maintenant' }),
    ).not.toBeInTheDocument()
  })
})
