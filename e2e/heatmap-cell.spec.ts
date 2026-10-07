import type { Page } from '@playwright/test'
import { installAnalysisProviders } from './support/analysisProviders'
import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
  measureLayout,
} from './support/layout'
import { expect, test } from './support/test'

/**
 * Carte de potentiel : fiche d'une cellule.
 *
 * SIMULÉ : Open-Meteo et Overpass sont des fixtures (`analysisProviders.ts`)
 * avec la vraie FORME des réponses, et le fond de carte est le faux
 * backend (`mockMapBackend.ts`). On prouve donc la logique de l'application
 * (famille par famille, heures, comparaison, waypoint via le parcours
 * existant, mise en page), jamais l'exactitude des services réels.
 */

const VIEWPORTS = [
  { name: '320x568', width: 320, height: 568 },
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: '568x320 (paysage)', width: 568, height: 320 },
  { name: '844x390 (paysage)', width: 844, height: 390 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900, desktop: true },
] as const

interface StoredWaypoint {
  name: string
  coordinate: { lat: number; lng: number }
}

function readWaypoints(page: Page): Promise<StoredWaypoint[]> {
  return page.evaluate(
    () =>
      new Promise<StoredWaypoint[]>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const all = open.result
            .transaction('waypoints', 'readonly')
            .objectStore('waypoints')
            .getAll()
          all.onsuccess = () => resolve(all.result as StoredWaypoint[])
          all.onerror = () => reject(all.error)
        }
      }),
  )
}

/** Un point de la carte réellement touchable (pas sous un panneau ni un bouton). */
async function clearMapPoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.maplibregl-canvas')
    if (!canvas) return null
    const r = canvas.getBoundingClientRect()
    for (const fy of [0.3, 0.4, 0.5, 0.2, 0.6, 0.7, 0.8]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.9, 0.1]) {
        const x = r.x + r.width * fx
        const y = r.y + r.height * fy
        if (document.elementFromPoint(x, y) === canvas) return { x, y }
      }
    }
    return null
  })
  expect(point, 'aucun point de la carte n’est touchable').not.toBeNull()
  return point as { x: number; y: number }
}

async function openHeatmap(page: Page) {
  await page.getByRole('button', { name: 'Outils' }).click()
  await page
    .getByRole('dialog', { name: 'Outils de la carte' })
    .getByRole('button', { name: 'Carte de potentiel' })
    .click()
  await expect(page.getByTestId('heatmap-panel')).toBeVisible()
  await expect(page.getByLabel('Score affiché')).toBeVisible({ timeout: 20_000 })
}

async function openCellSheet(page: Page) {
  const point = await clearMapPoint(page)
  await page.mouse.click(point.x, point.y)
  await expect(page.getByTestId('heatmap-cell-sheet')).toBeVisible()
}

function torontoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  )
}

test.describe('carte de potentiel : fiche de cellule (390x844)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })

  test('familles, heures, comparaison, puis enregistrement via le parcours existant (position verrouillée)', async ({
    context,
    page,
    backend,
  }) => {
    void backend
    await applySafeArea(context, page, IPHONE_PORTRAIT_SAFE_AREA)
    const counts = await installAnalysisProviders(page)
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

    await openHeatmap(page)
    // Exactement 3 requêtes : un lot de vent, un point météo, une requête OSM.
    expect(counts).toEqual({ weather: 1, wind: 1, overpass: 1 })
    await expect(
      page.getByText('Analyse environnementale générale', { exact: false }),
    ).toBeVisible()
    await expect(page.getByText(/pas une probabilité de présence/)).toBeVisible()
    await expect(page.getByText(/Cellules ≈ .* km/)).toBeVisible()

    await openCellSheet(page)
    const sheet = page.getByTestId('heatmap-cell-sheet')

    // Trois familles séparées, couverture en texte (pas de % de confiance).
    for (const name of [
      'Famille Habitat',
      'Famille Conditions',
      'Famille Observations',
    ]) {
      await expect(sheet.getByRole('region', { name })).toBeVisible()
    }
    await expect(sheet.getByTestId('coverage-line')).toContainText(
      /\d groupes? de facteurs sur 6 renseignés?/,
    )
    await expect(sheet.getByText(/confiance/i)).toHaveCount(0)

    // Météo : étiquette « actuel » et mention « identique sur toute la zone ».
    await sheet
      .getByRole('region', { name: 'Famille Conditions' })
      .getByRole('button', { name: /Météo/ })
      .click()
    await expect(sheet.getByText('actuel', { exact: true }).first()).toBeVisible()
    await expect(sheet.getByText('identique sur toute la zone').first()).toBeVisible()

    // Changer d'heure : aucune requête de plus.
    const hourSelect = sheet.getByLabel('Heure analysée')
    const options = await hourSelect.locator('option').evaluateAll((els) =>
      els.map((el) => ({
        value: (el as HTMLOptionElement).value,
        text: el.textContent ?? '',
      })),
    )
    const slot = options.find(
      (o) => o.text.includes('18:00') && !o.text.includes('demain'),
    )
    expect(slot, 'le créneau de 18 h est dans les données chargées').toBeTruthy()
    await hourSelect.selectOption(slot?.value ?? '')
    await expect(
      sheet.getByText(/(prévision pour|heure passée) 18:00/).first(),
    ).toBeVisible()
    expect(counts).toEqual({ weather: 1, wind: 1, overpass: 1 })

    // Comparer maintenant et un autre créneau.
    const compareValue = torontoHour() === 18 ? undefined : slot?.value
    if (compareValue) {
      await sheet.getByLabel('Créneau à comparer').selectOption(compareValue)
      const comparison = sheet.getByRole('region', { name: 'Comparer deux créneaux' })
      await expect(comparison.getByText(/Indice : maintenant/)).toBeVisible()
      await expect(comparison.getByText(/Fortes précipitations/)).toBeVisible()
    }
    expect(counts).toEqual({ weather: 1, wind: 1, overpass: 1 })

    // Enregistrer comme waypoint : parcours EXISTANT (brouillon puis Save).
    const centerText = await sheet.getByText(/centre -?\d+\.\d+, -?\d+\.\d+/).innerText()
    const match = /centre (-?\d+\.\d+), (-?\d+\.\d+)/.exec(centerText)
    expect(match).not.toBeNull()
    const center = { lat: Number(match?.[1]), lng: Number(match?.[2]) }

    await sheet
      .getByRole('button', { name: 'Enregistrer cette cellule comme waypoint' })
      .click()
    await expect(sheet).toBeHidden()
    const draftBar = page.getByRole('region', {
      name: 'Position du nouveau point de repère',
    })
    await expect(draftBar).toBeVisible()
    expect(await readWaypoints(page), 'rien n’est écrit avant Enregistrer').toEqual([])

    await page.getByRole('button', { name: 'Continuer' }).click()
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect.poll(async () => (await readWaypoints(page)).length).toBe(1)
    const [saved] = await readWaypoints(page)
    expect(saved.coordinate.lat).toBeCloseTo(center.lat, 3)
    expect(saved.coordinate.lng).toBeCloseTo(center.lng, 3)

    // Verrouillée : un toucher sur la carte ne la déplace pas.
    const point = await clearMapPoint(page)
    await page.mouse.click(point.x, point.y)
    const [after] = await readWaypoints(page)
    expect(after.coordinate).toEqual(saved.coordinate)
  })
})

for (const viewport of VIEWPORTS) {
  test.describe(`fiche de cellule — ${viewport.name}`, () => {
    const desktop = 'desktop' in viewport
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: !desktop,
      isMobile: !desktop,
      deviceScaleFactor: desktop ? 1 : 2,
    })

    test('défile à l’intérieur, reste dans l’écran, boutons utilisables', async ({
      context,
      page,
      backend,
    }) => {
      void backend
      const landscape = viewport.width > viewport.height
      if (!desktop && viewport.width < 768) {
        await applySafeArea(
          context,
          page,
          landscape ? IPHONE_LANDSCAPE_SAFE_AREA : IPHONE_PORTRAIT_SAFE_AREA,
        )
      }
      await installAnalysisProviders(page)
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

      await openHeatmap(page)
      await openCellSheet(page)

      const sheet = page.getByTestId('heatmap-cell-sheet')
      const m = await measureLayout(page, '[data-testid="heatmap-cell-sheet"]')
      expect(
        m.document.scrollWidth,
        'défilement horizontal de la page',
      ).toBeLessThanOrEqual(m.document.clientWidth)
      expect(
        m.document.scrollHeight,
        'défilement vertical de la page',
      ).toBeLessThanOrEqual(m.document.clientHeight)

      // La fiche tient dans l'écran et défile en interne.
      const box = await sheet.boundingBox()
      expect(box).not.toBeNull()
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(-0.5)
        expect(box.y).toBeGreaterThanOrEqual(-0.5)
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5)
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5)
      }
      const scroll = await sheet.evaluate((el) => ({
        overflowY: getComputedStyle(el).overflowY,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }))
      expect(scroll.overflowY).toBe('auto')
      expect(
        scroll.scrollWidth,
        'débordement horizontal de la fiche',
      ).toBeLessThanOrEqual(scroll.clientWidth + 1)
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight) // contenu long → défile

      // Le bouton de fermeture (en-tête collant) reste atteignable après défilement.
      await sheet.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
      const close = sheet.getByRole('button', { name: 'Fermer la fiche de la cellule' })
      const closeBox = await close.boundingBox()
      expect(closeBox).not.toBeNull()
      if (closeBox) {
        expect(closeBox.y).toBeGreaterThanOrEqual(-0.5)
        expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(viewport.height + 0.5)
        if (!desktop) {
          expect(Math.min(closeBox.width, closeBox.height)).toBeGreaterThanOrEqual(44)
        }
      }

      // Bouton « Enregistrer… » : atteignable et d'au moins 44 px au toucher.
      const save = sheet.getByRole('button', {
        name: 'Enregistrer cette cellule comme waypoint',
      })
      await save.scrollIntoViewIfNeeded()
      const saveBox = await save.boundingBox()
      expect(saveBox).not.toBeNull()
      if (saveBox) {
        expect(saveBox.x + saveBox.width).toBeLessThanOrEqual(viewport.width + 0.5)
        expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(viewport.height + 0.5)
        if (!desktop) expect(saveBox.height).toBeGreaterThanOrEqual(44)
      }
      const hit = await save.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
        return top === el || el.contains(top)
      })
      expect(hit, 'le bouton est recouvert').toBe(true)

      // Les listes déroulantes de la fiche sont aussi assez grandes au toucher.
      if (!desktop) {
        const selects = await sheet
          .locator('select')
          .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
        for (const height of selects) expect(height).toBeGreaterThanOrEqual(44)
      }
    })
  })
}
