import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { readWaypoints } from './support/waypointData'
import { expect, test } from './support/test'

/**
 * Product finish (accueil, présentation, aide, confidentialité, à propos).
 * Chromium on the production build, with the map backend SIMULATED; browser
 * permission APIs are wrapped to count calls. This proves the app's logic and
 * wording, NOT the behaviour of an installed PWA or of GPS on a real iPhone.
 */
const PACKAGE_VERSION = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
).version

interface PermissionCounters {
  geolocation: number
  camera: number
}

/** Counts every call that could make the browser ask for a permission. */
async function countPermissionRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const counters: PermissionCounters = { geolocation: 0, camera: 0 }
    ;(window as unknown as { __permissions: PermissionCounters }).__permissions = counters
    const geolocation = navigator.geolocation as unknown as Record<string, unknown>
    for (const method of ['watchPosition', 'getCurrentPosition']) {
      const original = geolocation[method] as (...args: unknown[]) => unknown
      geolocation[method] = (...args: unknown[]) => {
        counters.geolocation += 1
        return original.apply(navigator.geolocation, args)
      }
    }
    const media = navigator.mediaDevices as unknown as Record<string, unknown>
    const getUserMedia = media.getUserMedia as (...args: unknown[]) => unknown
    media.getUserMedia = (...args: unknown[]) => {
      counters.camera += 1
      return getUserMedia.apply(navigator.mediaDevices, args)
    }
  })
}

function permissionCounters(page: Page): Promise<PermissionCounters> {
  return page.evaluate(
    () => (window as unknown as { __permissions: PermissionCounters }).__permissions,
  )
}

async function skipOnboarding(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Passer' }).click()
  await expect(dialog).toHaveCount(0)
}

test.describe('accueil et présentation', () => {
  test('premier lancement : présentation en 4 écrans, sans aucune demande de permission', async ({
    page,
    backend,
  }) => {
    await countPermissionRequests(page)
    await page.goto('')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Présentation · 1 sur 4')
    await dialog.getByRole('button', { name: 'Suivant' }).click()
    await expect(dialog).toContainText('Vos données restent sur votre appareil')
    await dialog.getByRole('button', { name: 'Suivant' }).click()
    await expect(dialog).toContainText('Pensez à sauvegarder')
    await dialog.getByRole('button', { name: 'Suivant' }).click()
    await expect(dialog).toContainText('Rien n’est demandé maintenant')
    await dialog.getByRole('button', { name: 'Terminer' }).click()
    await expect(dialog).toHaveCount(0)

    expect(await permissionCounters(page)).toEqual({ geolocation: 0, camera: 0 })
    expect(backend.unexpectedHosts()).toEqual([])
  })

  test('« Passer » est mémorisé : la présentation ne revient pas après rechargement', async ({
    page,
    backend,
  }) => {
    void backend
    await page.goto('')
    await skipOnboarding(page)

    await page.reload()
    await expect(
      page.getByRole('heading', { level: 1, name: 'CTR Hunting' }),
    ).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('la présentation se rejoue depuis Réglages', async ({ page, backend }) => {
    void backend
    await page.goto('')
    await skipOnboarding(page)

    await page.goto('settings')
    await page.getByRole('button', { name: /Revoir la présentation/ }).click()
    await expect(page.getByRole('dialog')).toContainText('À quoi sert CTR Hunting')
  })

  test('l’accueil montre des états vides utiles et ne demande aucune permission', async ({
    page,
    backend,
  }) => {
    await countPermissionRequests(page)
    await page.goto('')
    await skipOnboarding(page)

    await expect(
      page.getByRole('heading', { level: 1, name: 'CTR Hunting' }),
    ).toBeVisible()
    const home = page.getByRole('main')
    await expect(home).toContainText('Aucun point de repère')
    await expect(home.getByRole('link', { name: 'Créer le premier' })).toBeVisible()
    await expect(home).toContainText('Aucun guidage en cours')
    await expect(home).toContainText('Aucune zone téléchargée')
    await expect(home).toContainText('Aucune trace ni entrée')
    await expect(home).toContainText('Indisponible : aucune prévision')
    await expect(home).toContainText('Dernière sauvegarde : jamais')
    await expect(page.getByRole('button', { name: 'Charger la météo' })).toBeEnabled()
    // The old developer roadmap is gone from the home page.
    await expect(home).not.toContainText('Feuille de route')

    await home.getByRole('link', { name: 'Ouvrir la carte' }).click()
    await expect(page).toHaveURL(/\/CTR-HUNTING\/map$/)

    expect(backend.unexpectedHosts()).toEqual([])
  })
})

test.describe('aide', () => {
  test('explique les limites du GPS sur iPhone et se parcourt par ancres', async ({
    page,
    backend,
  }) => {
    void backend
    await page.goto('help#limites-gps')

    await expect(page.getByRole('heading', { level: 1, name: 'Aide' })).toBeVisible()
    const gps = page.locator('#limites-gps')
    await expect(gps).toContainText('suspend le GPS quand l’écran se verrouille')
    await expect(gps).toContainText('ne peut pas enregistrer en arrière-plan')
    await expect(gps).toBeInViewport()

    await page
      .getByRole('navigation', { name: 'Sujets de l’aide' })
      .getByRole('link', { name: 'Cartes hors ligne' })
      .click()
    await expect(page.locator('#hors-ligne')).toContainText('« Terminée » signifie')
    await expect(page.locator('#hors-ligne')).toBeInViewport()
    await expect(page.locator('#potentiel')).toContainText(
      'Un indice n’est pas une probabilité',
    )
  })

  test('accessible depuis Réglages et depuis l’accueil, pas depuis la barre du bas', async ({
    page,
    backend,
  }) => {
    void backend
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('')
    await skipOnboarding(page)

    const bottom = page.getByRole('navigation', { name: 'Navigation principale' })
    await expect(bottom).toBeVisible()
    await expect(bottom.getByRole('link', { name: /Aide/ })).toHaveCount(0)

    await page
      .getByRole('navigation', { name: 'Aide et informations' })
      .getByRole('link', { name: 'Aide' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Aide' })).toBeVisible()

    await page.goto('settings')
    await page.getByRole('link', { name: 'Aide', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Aide' })).toBeVisible()
  })
})

test.describe('confidentialité', () => {
  test('décrit les services contactés et ne prétend à aucune conformité légale', async ({
    page,
    backend,
  }) => {
    void backend
    await page.goto('privacy')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Confidentialité' }),
    ).toBeVisible()
    const note = page.getByRole('note')
    await expect(note).toContainText('fonctionnement technique')
    await expect(note).toContainText('pas un avis juridique')
    const main = page.getByRole('main')
    for (const host of [
      'api.open-meteo.com',
      'overpass-api.de',
      'api.maptiler.com',
      'geo.weather.gc.ca',
    ]) {
      await expect(main).toContainText(host)
    }
    await expect(main).not.toContainText(/Loi 25|RGPD|GDPR/)
  })

  test('suppression en deux étapes : annuler ne supprime rien, confirmer supprime tout', async ({
    page,
    backend,
  }) => {
    void backend
    await page.goto('privacy')

    // Step 1 opens the database; then a waypoint is written straight into it.
    await page.getByRole('button', { name: /Supprimer toutes mes données/ }).click()
    await expect(page.getByRole('group', { name: 'Étape 1 sur 2' })).toBeVisible()
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('field-terrain-intelligence')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const now = new Date().toISOString()
            const tx = open.result.transaction('waypoints', 'readwrite')
            tx.objectStore('waypoints').put({
              id: 'e2e-1',
              name: 'Poste E2E',
              coordinate: { lat: 46.8, lng: -71.2 },
              category: 'stand_blind',
              createdAt: now,
              updatedAt: now,
            })
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
          }
        }),
    )
    await page.getByRole('button', { name: 'Annuler' }).click()
    expect(await readWaypoints(page)).toHaveLength(1)

    // Step 1 again: the summary now counts the point. Cancel at step 2.
    await page.getByRole('button', { name: /Supprimer toutes mes données/ }).click()
    const list = page.getByRole('list', { name: 'Ce qui sera supprimé' })
    await expect(list).toContainText('Points de repère')
    await expect(list.locator('li').first().locator('strong')).toHaveText('1')
    await page.getByRole('button', { name: 'Continuer' }).click()
    const confirm = page.getByRole('button', { name: 'Supprimer définitivement' })
    await expect(confirm).toBeDisabled()
    await page.getByLabel(/Pour confirmer, tapez/).fill('peut-être')
    await expect(confirm).toBeDisabled()
    await page.getByRole('button', { name: 'Annuler' }).click()
    expect(await readWaypoints(page)).toHaveLength(1)

    // Both steps, with the word: everything goes.
    await page.getByRole('button', { name: /Supprimer toutes mes données/ }).click()
    await page.getByRole('button', { name: 'Continuer' }).click()
    await page.getByLabel(/Pour confirmer, tapez/).fill('SUPPRIMER')
    await confirm.click()
    await expect(page.getByText('Vos données ont été supprimées')).toBeVisible()
    expect(await readWaypoints(page)).toHaveLength(0)
  })
})

test.describe('à propos', () => {
  test('affiche la version du paquet, l’état honnête des phases et les crédits', async ({
    page,
    backend,
  }) => {
    void backend
    await page.goto('about')

    await expect(page.getByRole('heading', { level: 1, name: 'À propos' })).toBeVisible()
    await expect(page.locator('#version')).toContainText(`version ${PACKAGE_VERSION}`)
    await expect(page.locator('#version')).toContainText(
      'Comptes, abonnements et paiement : non disponibles / reportés',
    )
    const phases = page.locator('#phases')
    await expect(phases.locator('li', { hasText: '14. IA et assistant' })).toContainText(
      'Non commencée',
    )
    for (const phase of [
      '15. Synchronisation',
      '16. Tests et optimisation',
      '17. Version commerciale',
    ]) {
      const item = phases.locator('li', { hasText: phase })
      await expect(item).toContainText('Partielle')
      await expect(item).not.toContainText('Livrée')
    }
    await expect(page.locator('#sources')).toContainText('Open-Meteo')
    await expect(page.locator('#sources')).toContainText('OpenStreetMap')
  })

  test('cherche une mise à jour auprès du service worker existant', async ({
    page,
    backend,
  }) => {
    void backend
    await page.goto('about')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()
    await expect(page.locator('#mise-a-jour')).toContainText(/actif/)

    await page.getByRole('button', { name: 'Rechercher une mise à jour' }).click()
    await expect(page.locator('#mise-a-jour')).toContainText(
      'Aucune nouvelle version détectée.',
    )
    // The same single worker is still the one in charge.
    expect(
      await page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
    ).toBe(1)
  })
})
