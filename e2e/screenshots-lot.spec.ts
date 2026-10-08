import type { Page } from '@playwright/test'
import { installAnalysisProviders } from './support/analysisProviders'
import { stubGps } from './support/browserStubs'
import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
} from './support/layout'
import { createWaypointViaUi } from './support/waypointData'
import { expect, test } from './support/test'

/**
 * Evidence screenshots of the "lot" screens (home, potential map, cache
 * comparator, territories, backup, measure, assistant, help, about, Quebec
 * layers). Only runs with E2E_SCREENSHOTS=1. SIMULATED map provider, weather/
 * OSM fixtures and GPS, Chromium with emulated iPhone safe areas — not a real
 * device.
 */
const SIZES = [
  { name: 'portrait-390x844', width: 390, height: 844, landscape: false },
  { name: 'paysage-844x390', width: 844, height: 390, landscape: true },
]

test.skip(
  process.env.E2E_SCREENSHOTS !== '1',
  'captures uniquement avec E2E_SCREENSHOTS=1',
)

async function openTool(page: Page, name: string | RegExp) {
  await page.getByRole('button', { name: 'Outils' }).click()
  await page
    .getByRole('dialog', { name: 'Outils de la carte' })
    .getByRole('button', { name })
    .click()
}

async function clearMapPoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.maplibregl-canvas')
    if (!canvas) return null
    const r = canvas.getBoundingClientRect()
    for (const fy of [0.3, 0.4, 0.5, 0.2, 0.6, 0.7, 0.8]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.9, 0.1]) {
        const x = r.x + r.width * fx
        const y = r.y + r.height * fy
        // Évite la bannière de placement, en haut de la carte.
        if (y < r.y + 90) continue
        if (document.elementFromPoint(x, y) === canvas) return { x, y }
      }
    }
    return null
  })
  expect(point, 'aucun point de la carte n’est touchable').not.toBeNull()
  return point as { x: number; y: number }
}

/** Points de la carte réellement touchables (ni sous un panneau ni sous un
 * bouton), espacés d'au moins 70 px, en coordonnées de la fenêtre. */
async function freePoints(
  page: Page,
  count: number,
): Promise<{ x: number; y: number }[]> {
  const points = await page.evaluate((wanted) => {
    const canvas = document.querySelector('canvas.maplibregl-canvas')
    if (!canvas) return []
    const r = canvas.getBoundingClientRect()
    const found: { x: number; y: number }[] = []
    for (let fy = 0.1; fy <= 0.95; fy += 0.05) {
      for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
        const x = r.x + r.width * fx
        const y = r.y + r.height * fy
        if (document.elementFromPoint(x, y) !== canvas) continue
        if (found.some((p) => Math.hypot(p.x - x, p.y - y) < 70)) continue
        found.push({ x, y })
        if (found.length >= wanted) return found
      }
    }
    return found
  }, count)
  expect(points.length, 'pas assez de points touchables sur la carte').toBe(count)
  return points
}

/** Crée un waypoint via le parcours réel, à un point libre de la carte. */
async function createWaypointAt(
  page: Page,
  name: string,
  at: { x: number; y: number },
  notes?: string,
) {
  const box = await page.locator('canvas.maplibregl-canvas').boundingBox()
  if (!box) throw new Error('no canvas')
  return createWaypointViaUi(page, name, { x: at.x - box.x, y: at.y - box.y }, notes)
}

for (const size of SIZES) {
  test.describe(`captures du lot ${size.name}`, () => {
    test.describe.configure({ timeout: 60_000 })
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8139, longitude: -71.208, accuracy: 6 },
    })

    const shot = (page: Page, screen: string) =>
      page.screenshot({ path: `docs/validation/lot-${screen}-${size.name}.png` })

    test.beforeEach(async ({ context, page, backend }) => {
      void backend
      await applySafeArea(
        context,
        page,
        size.landscape ? IPHONE_LANDSCAPE_SAFE_AREA : IPHONE_PORTRAIT_SAFE_AREA,
      )
    })

    test('accueil, aide, à propos, assistant, réglages', async ({ page }) => {
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      const [spot] = await freePoints(page, 1)
      await createWaypointAt(
        page,
        'Poste du nord',
        spot as { x: number; y: number },
        'Bon vent du nord',
      )

      await page.goto('/')
      await page.getByRole('button', { name: 'Passer' }).click()
      await expect(page.getByRole('button', { name: 'Passer' })).toHaveCount(0)
      await expect(page.getByText('1 point(s) de repère enregistré(s).')).toBeVisible()
      await shot(page, 'accueil')

      await page.goto('help')
      await expect(page.getByRole('heading', { name: /Aide/ }).first()).toBeVisible()
      await shot(page, 'aide')

      await page.goto('about')
      await expect(page.getByRole('heading', { name: /propos/i }).first()).toBeVisible()
      await shot(page, 'a-propos')

      await page.goto('assistant')
      await page.getByRole('tab', { name: 'Résumer un territoire' }).click()
      await expect(page.getByTestId('assistant-result')).toContainText(
        '1 point de repère',
      )
      await shot(page, 'assistant')

      await page.goto('settings')
      const backup = page.getByRole('heading', { name: 'Données et sauvegarde' })
      await expect(backup).toBeVisible()
      await backup.scrollIntoViewIfNeeded()
      await expect(
        page.getByRole('button', { name: 'Sauvegarder maintenant' }),
      ).toBeVisible()
      await shot(page, 'reglages-sauvegarde')
    })

    test('territoires', async ({ page }) => {
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      const spots = await freePoints(page, 2)
      await createWaypointAt(page, 'Poste du nord', spots[0] as { x: number; y: number })
      await createWaypointAt(page, 'Cache libre', spots[1] as { x: number; y: number })
      await page.goto('waypoints')
      await page.getByRole('button', { name: 'Gérer les territoires' }).click()
      const manager = page.getByRole('region', { name: 'Gestion des territoires' })
      for (const name of ['Secteur nord', 'Secteur du lac']) {
        await manager.getByLabel('Nom du nouveau territoire').fill(name)
        await manager.getByRole('button', { name: 'Créer', exact: true }).click()
        await expect(manager.getByText(name)).toBeVisible()
      }
      await manager.scrollIntoViewIfNeeded()
      await shot(page, 'territoires')
    })

    test('carte de potentiel avec fiche de cellule', async ({ page }) => {
      await installAnalysisProviders(page)
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      await openTool(page, 'Carte de potentiel')
      await expect(page.getByTestId('heatmap-panel')).toBeVisible()
      await expect(page.getByLabel('Score affiché')).toBeVisible({ timeout: 20_000 })
      const point = await clearMapPoint(page)
      await page.mouse.click(point.x, point.y)
      await expect(page.getByTestId('heatmap-cell-sheet')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Famille Habitat' })).toBeVisible()
      await shot(page, 'potentiel-fiche')
    })

    test('comparateur de caches', async ({ page }) => {
      await installAnalysisProviders(page)
      await stubGps(page, {
        kind: 'fix',
        lat: 46.8139,
        lng: -71.208,
        accuracy: 6,
        ageMs: 0,
      })
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      const spots = await freePoints(page, 3)
      await createWaypointAt(page, 'Poste A', spots[0] as { x: number; y: number })
      await createWaypointAt(page, 'Poste B', spots[1] as { x: number; y: number })
      await createWaypointAt(page, 'Poste C', spots[2] as { x: number; y: number })
      await page.goto('waypoints')
      await expect(
        page.getByRole('heading', { name: /Points de repère \(3\)/ }),
      ).toBeVisible()
      for (const name of ['Poste A', 'Poste B', 'Poste C']) {
        await page.getByRole('checkbox', { name: `Comparer : ${name}` }).check()
      }
      await page.getByRole('button', { name: /^Comparer \(\d\)/ }).click()
      const panel = page.getByRole('region', { name: 'Comparaison de caches' })
      await expect(panel).toBeVisible()
      await expect(panel.getByText('Vent et météo : requête groupée')).toBeVisible()
      await expect(panel.getByText('Couverture', { exact: true }).first()).toBeVisible()
      await shot(page, 'comparateur')
    })

    test('outil de mesure avec une surface', async ({ page }) => {
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      await openTool(page, 'Mesurer une surface')
      const panel = page.getByRole('region', { name: 'Mesure de surface' })
      await expect(panel).toBeVisible()
      const spots = await freePoints(page, 4)
      const cx = spots.reduce((sum, p) => sum + p.x, 0) / spots.length
      const cy = spots.reduce((sum, p) => sum + p.y, 0) / spots.length
      spots.sort(
        (p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx),
      )
      for (const spot of spots) await page.mouse.click(spot.x, spot.y)
      await expect(page.getByTestId('measure-status')).toContainText('4 points')
      await shot(page, 'mesure')
    })

    test('couches du Québec', async ({ page }) => {
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      await openTool(page, /Couches du Québec/)
      await expect(page.getByRole('heading', { name: 'Couches du Québec' })).toBeVisible()
      // Groups are collapsed unless a layer in them is on: open the first one.
      await page
        .getByRole('dialog', { name: 'Couches du Québec' })
        .locator('summary')
        .first()
        .click()
      await page.getByRole('switch').first().click()
      await shot(page, 'couches-quebec')
    })
  })
}
