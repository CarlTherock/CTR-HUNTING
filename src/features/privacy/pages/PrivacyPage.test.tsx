import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PROVIDER_HOSTS } from '../../../../build/csp'
import { displayHost } from '../networkProviders'
import PrivacyPage from './PrivacyPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>,
  )
}

describe('PrivacyPage', () => {
  it('states that it is a technical description and claims no legal compliance', () => {
    renderPage()

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('fonctionnement technique')
    expect(note).toHaveTextContent('Ce n’est pas un avis juridique')
    expect(note).toHaveTextContent(/n’affirme la conformité à aucune loi/)
    // No unverified compliance claim anywhere on the page.
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/Loi 25|RGPD|GDPR|PIPEDA|LPRPDE|CCPA/i)
    expect(text).not.toMatch(/conforme à/i)
  })

  it('says there is no account, no analytics and no payment', () => {
    renderPage()

    const section = screen
      .getByRole('heading', { name: /Aucun compte, aucun pistage/ })
      .closest('div')?.parentElement as HTMLElement
    expect(within(section).getByText(/pas de compte/)).toBeVisible()
    expect(within(section).getByText(/aucun outil d’analyse/)).toBeVisible()
    expect(
      within(section).getByText(/Comptes, abonnements et paiement : non disponibles/),
    ).toBeVisible()
  })

  it('names every outside service the Content-Security-Policy allows, with what is sent', () => {
    renderPage()

    const text = document.body.textContent ?? ''
    for (const host of PROVIDER_HOSTS) {
      expect(text, `hôte absent de la page : ${host}`).toContain(displayHost(host))
    }
    for (const name of [
      'MapTiler',
      'Esri',
      'Open-Meteo',
      'Overpass',
      'GeoMet',
      'Forêt ouverte',
    ]) {
      expect(text).toContain(name)
    }
    expect(text).toMatch(/adresse IP/)
    // Open-Meteo receives exact coordinates: the page must not understate it.
    expect(text).toMatch(/sans arrondi/)
  })

  it('lists what is never sent: notes, photos, waypoints', () => {
    renderPage()

    const section = screen
      .getByRole('heading', { name: 'Ce qui n’est jamais envoyé' })
      .closest('div')?.parentElement as HTMLElement
    expect(section).toHaveTextContent(/notes.*photos/)
    expect(section).toHaveTextContent(/points de repère/)
    expect(section).toHaveTextContent(/traces/)
  })

  it('links to the backup (export) and offers the deletion flow', () => {
    renderPage()

    expect(
      screen.getAllByRole('link', {
        name: /sauvegarde en fichier|Données et sauvegarde/,
      })[0],
    ).toHaveAttribute('href', '/settings#donnees-et-sauvegarde')
    expect(
      screen.getByRole('button', { name: /Supprimer toutes mes données/ }),
    ).toBeVisible()
  })

  it('explains that permissions are asked at the moment of use', () => {
    renderPage()

    const section = screen
      .getByRole('heading', { name: 'Permissions de l’appareil' })
      .closest('div')?.parentElement as HTMLElement
    expect(section).toHaveTextContent(/Position/)
    expect(section).toHaveTextContent(/Boussole/)
    expect(section).toHaveTextContent(/Caméra/)
  })
})
