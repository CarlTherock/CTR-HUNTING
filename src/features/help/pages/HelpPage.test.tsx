import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useOnboardingStore } from '@/features/onboarding/state/onboardingStore'
import HelpPage from './HelpPage'
import { HELP_TOPICS } from '../helpTopics'

function renderPage() {
  return render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  )
}

function section(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`section #${id} introuvable`)
  return element
}

beforeEach(() => {
  useOnboardingStore.setState({ loaded: true, completed: true, open: false })
})

afterEach(() => {
  useOnboardingStore.setState({ open: false })
})

describe('HelpPage', () => {
  it('has a section for every topic of its table of contents', () => {
    renderPage()

    expect(HELP_TOPICS.length).toBeGreaterThanOrEqual(11)
    for (const [id, label] of HELP_TOPICS) {
      expect(within(section(id)).getByRole('heading', { name: label })).toBeVisible()
      expect(
        within(screen.getByRole('navigation', { name: 'Sujets de l’aide' })).getByRole(
          'link',
          {
            name: label,
          },
        ),
      ).toHaveAttribute('href', `#${id}`)
    }
  })

  it('explains the iPhone GPS limits plainly', () => {
    renderPage()

    const gps = section('limites-gps')
    expect(gps).toHaveTextContent(/suspend le GPS quand l’écran se verrouille/)
    expect(gps).toHaveTextContent(/ne peut pas enregistrer en arrière-plan/)
    expect(gps).toHaveTextContent(/précision/i)
    expect(gps).toHaveTextContent(/calibrée/)
    expect(gps).toHaveTextContent(/par site/)
  })

  it('documents the position lock after saving a waypoint', () => {
    renderPage()

    expect(section('waypoints')).toHaveTextContent(/position est verrouillée/)
    expect(section('waypoints')).toHaveTextContent(
      /supprimez le point et créez-en un nouveau/,
    )
  })

  it('explains interrupted tracks and the straight line on resume', () => {
    renderPage()

    expect(section('traces')).toHaveTextContent(/interrompue/)
    expect(section('traces')).toHaveTextContent(/ligne droite/)
  })

  it('says what « Terminée » means and where « Réessayer » is', () => {
    renderPage()

    const offline = section('hors-ligne')
    expect(offline).toHaveTextContent(
      /« Terminée » signifie que toutes les requêtes du balayage ont réussi/,
    )
    expect(offline).toHaveTextContent(/pas une garantie de couverture/)
    expect(offline).toHaveTextContent(/« Réessayer »/)
    expect(offline).toHaveTextContent(/Réglages/)
  })

  it('says a potential index is not a probability', () => {
    renderPage()

    expect(section('potentiel')).toHaveTextContent(/Un indice n’est pas une probabilité/)
  })

  it('gives the iPhone installation steps and the Android route', () => {
    renderPage()

    const install = section('installer')
    expect(install).toHaveTextContent('Partager')
    expect(install).toHaveTextContent('Sur l’écran d’accueil')
    expect(install).toHaveTextContent(/Android/)
  })

  it('links back to the backup and privacy pages', () => {
    renderPage()

    expect(
      within(section('sauvegarde')).getByRole('link', { name: /Données et sauvegarde/ }),
    ).toHaveAttribute('href', '/settings#donnees-et-sauvegarde')
    expect(
      within(section('permissions')).getByRole('link', { name: 'Confidentialité' }),
    ).toHaveAttribute('href', '/privacy#permissions')
  })

  it('replays the presentation on demand', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /Revoir la présentation/ }))

    expect(useOnboardingStore.getState().open).toBe(true)
  })
})
