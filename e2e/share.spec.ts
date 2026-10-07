import type { Page } from '@playwright/test'
import { stubClipboardDenied, stubGps, stubShare } from './support/browserStubs'
import { expect, test } from './support/test'
import { createWaypointViaUi, type StoredWaypoint } from './support/waypointData'

/**
 * Sharing a saved point and a snapshot of the user's position.
 * `navigator.share`, the clipboard and the GPS receiver are SIMULATED
 * (Playwright init scripts / permissions): this proves what the app calls
 * and shows, not the behaviour of a real iOS share sheet.
 */
interface SharedData {
  title: string
  text: string
  url: string
}

function sharedCalls(page: Page): Promise<SharedData[]> {
  return page.evaluate(() => (window as unknown as { __shared: SharedData[] }).__shared)
}

async function saveAndOpen(page: Page): Promise<StoredWaypoint> {
  await page.goto('map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  const saved = await createWaypointViaUi(
    page,
    'Mirador nord',
    { x: 200, y: 250 },
    'NOTE-PRIVEE-XYZ',
  )
  await createWaypointViaUi(page, 'Autre repère secret', { x: 90, y: 330 })
  await page.getByTestId('waypoint-marker').first().click()
  await expect(page.getByTestId('waypoint-name')).toHaveText('Mirador nord')
  return saved
}

test.describe('partager ce point', () => {
  test.beforeEach(async ({ context, backend }) => {
    void backend
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('partage natif réussi : contenu limité au nom, aux coordonnées et aux liens', async ({
    page,
  }) => {
    await stubShare(page, 'success')
    await stubGps(page, {
      kind: 'fix',
      lat: 45.1234,
      lng: -70.9876,
      accuracy: 6,
      ageMs: 1000,
    })
    const saved = await saveAndOpen(page)
    expect(await sharedCalls(page)).toEqual([])

    await page.getByRole('button', { name: 'Partager ce point' }).click()

    const [data] = await sharedCalls(page)
    expect(await sharedCalls(page)).toHaveLength(1)
    const { lat, lng } = saved.coordinate
    expect(data.title).toBe('Mirador nord')
    expect(data.url).toBe(
      `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`,
    )
    const parsed = new URL(data.url)
    expect(parsed.searchParams.get('query')).toBe(`${lat},${lng}`)
    expect(data.text).toContain('Point : Mirador nord')
    expect(data.text).toContain(`(${lat.toFixed(5)})`)
    expect(data.text).toContain(`(${lng.toFixed(5)})`)
    expect(data.text).toMatch(/Latitude : \d+,\d{5}° N/)
    expect(data.text).toMatch(/Longitude : \d+,\d{5}° O/)
    expect(data.text).toMatch(/CTR Hunting : http:\/\/localhost:4173\/CTR-HUNTING\/\?p=/)

    const everything = JSON.stringify(data)
    for (const forbidden of [
      'NOTE-PRIVEE-XYZ',
      'Autre repère secret',
      '45.1234',
      '-70.9876',
      saved.id,
    ]) {
      expect(everything, `ne doit pas contenir ${forbidden}`).not.toContain(forbidden)
    }
    await expect(page.getByText('Partage effectué.')).toBeVisible()
  })

  test('partage annulé (AbortError) : aucun message d’erreur', async ({ page }) => {
    await stubShare(page, 'abort')
    await saveAndOpen(page)

    await page.getByRole('button', { name: 'Partager ce point' }).click()

    await expect.poll(async () => (await sharedCalls(page)).length).toBe(1)
    await expect(page.getByRole('button', { name: 'Partager ce point' })).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByText('Partage effectué.')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Copier le texte / lien' }),
    ).toHaveCount(0)
  })

  test('partage natif indisponible : repli « Copier le texte / lien » visible, copie réelle', async ({
    page,
  }) => {
    await stubShare(page, 'absent')
    await saveAndOpen(page)

    await expect(page.getByRole('button', { name: 'Partager ce point' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Copier le texte / lien' }).click()

    await expect(page.getByText('Texte et lien copiés.')).toBeVisible()
    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toContain('Point : Mirador nord')
    expect(clipboard).toContain('https://www.google.com/maps/search/?api=1&query=')
    expect(clipboard).toContain('CTR Hunting : ')
    expect(clipboard).not.toContain('NOTE-PRIVEE-XYZ')
  })

  test('partage natif en échec : le repli apparaît', async ({ page }) => {
    await stubShare(page, 'fail')
    await saveAndOpen(page)

    await page.getByRole('button', { name: 'Partager ce point' }).click()

    await expect(page.getByText('Le partage direct n’a pas abouti.')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Copier le texte / lien' }),
    ).toBeVisible()
  })

  test('copie du repli refusée : aucune confirmation, texte à copier à la main', async ({
    page,
  }) => {
    await stubShare(page, 'absent')
    await stubClipboardDenied(page)
    await saveAndOpen(page)

    await page.getByRole('button', { name: 'Copier le texte / lien' }).click()

    await expect(page.getByRole('alert')).toContainText('Copie impossible')
    await expect(page.getByText('Texte et lien copiés.')).toHaveCount(0)
    await expect(page.getByTestId('waypoint-manual-text')).toContainText('Mirador nord')
  })
})

test.describe('partager ma position (instantané)', () => {
  test.beforeEach(async ({ context, backend }) => {
    void backend
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  })

  test('explication visible avant, puis partage d’un instantané seulement', async ({
    page,
  }) => {
    await stubShare(page, 'success')
    await stubGps(page, {
      kind: 'fix',
      lat: 46.5,
      lng: -71.25,
      accuracy: 7.6,
      ageMs: 3000,
    })
    await saveAndOpen(page)

    const mine = page.getByTestId('my-position')
    await expect(mine.getByTestId('snapshot-explanation')).toContainText(
      'Instantané de ma position — pas un suivi en direct.',
    )
    expect(await sharedCalls(page)).toEqual([])

    await mine.getByRole('button', { name: 'Partager ma position' }).click()

    const [data] = await sharedCalls(page)
    expect(data.title).toBe('Ma position (instantané)')
    expect(data.text).toContain('Latitude : 46,50000° N (46.50000)')
    expect(data.text).toContain('Longitude : 71,25000° O (-71.25000)')
    expect(data.text).toContain('Précision : ±8 m')
    expect(data.text).toMatch(/Relevé : .+/)
    expect(data.text).toContain('Instantané de ma position — pas un suivi en direct.')
    expect(data.url).toBe('https://www.google.com/maps/search/?api=1&query=46.5%2C-71.25')
    expect(JSON.stringify(data)).not.toContain('Mirador nord')
  })

  test('depuis l’outil « Ma position » (sans fiche de waypoint)', async ({
    page,
    backend,
  }) => {
    void backend
    await stubShare(page, 'success')
    await stubGps(page, { kind: 'fix', lat: 46.5, lng: -71.25, accuracy: 5, ageMs: 1000 })
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

    await page.getByRole('button', { name: 'Outils' }).click()
    await page.getByRole('button', { name: 'Ma position', exact: true }).click()

    const card = page.getByRole('dialog', { name: 'Ma position' })
    await expect(card.getByTestId('gps-state')).toHaveText('Disponible')
    await card.getByRole('button', { name: 'Partager ma position' }).click()
    await expect.poll(async () => (await sharedCalls(page)).length).toBe(1)
  })

  test('relevé très ancien : aucun partage de position proposé', async ({
    page,
    backend,
  }) => {
    void backend
    await stubShare(page, 'success')
    await stubGps(page, {
      kind: 'fix',
      lat: 46.5,
      lng: -71.25,
      accuracy: 5,
      ageMs: 600_000,
    })
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Outils' }).click()
    await page.getByRole('button', { name: 'Ma position', exact: true }).click()

    const card = page.getByRole('dialog', { name: 'Ma position' })
    await expect(card.getByTestId('gps-warning')).toContainText('trop ancien')
    await expect(card.getByRole('button', { name: 'Partager ma position' })).toHaveCount(
      0,
    )
  })
})
