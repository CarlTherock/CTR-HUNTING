import type { Page } from '@playwright/test'
import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
  measureLayout,
  type SafeArea,
} from './support/layout'
import { hourlyTimes, installAnalysisProviders } from './support/analysisProviders'
import { expect, test } from './support/test'

/**
 * Les quatre états du bas d'écran avec zones sûres d'iPhone ÉMULÉES
 * (Chromium seulement, carte et prévisions SIMULÉES — pas un iPhone réel) :
 * carte normale, vent ouvert, immersif, immersif + vent.
 *
 * Règle vérifiée : en immersif, la carte couvre tout le viewport ; les zones
 * sûres protègent les COMMANDES ; le fond de la feuille de vent va jusqu'au
 * bord bas, ses commandes restent au-dessus de l'indicateur d'accueil.
 */
const CASES: { name: string; w: number; h: number; safe: SafeArea }[] = [
  { name: 'portrait 390x844', w: 390, h: 844, safe: IPHONE_PORTRAIT_SAFE_AREA },
  { name: 'paysage 844x390', w: 844, h: 390, safe: IPHONE_LANDSCAPE_SAFE_AREA },
]
const SHOTS = process.env.E2E_SCREENSHOTS === '1'

async function installWind(page: Page) {
  await installAnalysisProviders(page)
  const t = hourlyTimes(5)
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url())
    const lat = (url.searchParams.get('latitude') ?? '').split(',')
    if (lat.length < 2) return route.fallback()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(
        lat.map(() => ({
          timezone: 'America/Toronto',
          hourly: {
            time: t,
            wind_speed_10m: t.map(() => 12),
            wind_direction_10m: t.map(() => 90),
            wind_gusts_10m: t.map(() => 20),
            temperature_2m: t.map(() => 5),
            precipitation: t.map(() => 0),
            cloud_cover: t.map(() => 0),
          },
        })),
      ),
    })
  })
}

async function openWind(page: Page) {
  await page.getByRole('button', { name: 'Météo et radar' }).click()
  await page.getByRole('button', { name: 'Analyse du vent' }).click()
  await expect(page.getByTestId('wind-analysis')).toBeVisible()
  await expect(page.getByTestId('wind-readout')).toBeVisible()
}

/** Settled geometry: the map engine resizes a frame after the layout. */
async function settled(page: Page, w: number, h: number) {
  await expect
    .poll(async () => {
      const m = await measureLayout(page)
      return Math.abs((m.rects.canvas?.height ?? 0) - (m.rects.mapContainer?.height ?? 1))
    })
    .toBeLessThanOrEqual(2)
  void w
  void h
}

async function rectOf(page: Page, selector: string) {
  return page.evaluate((s) => {
    const e = document.querySelector(s)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }
  }, selector)
}

function expectInsideSafe(
  controls: {
    label: string
    rect: { x: number; y: number; width: number; height: number }
  }[],
  c: { w: number; h: number; safe: SafeArea },
  what: string,
) {
  const bad = controls
    .filter(
      (x) =>
        x.rect.y < c.safe.top - 0.5 ||
        x.rect.y + x.rect.height > c.h - c.safe.bottom + 0.5 ||
        x.rect.x < c.safe.left - 0.5 ||
        x.rect.x + x.rect.width > c.w - c.safe.right + 0.5,
    )
    .map(
      (x) =>
        `${x.label} @ y${Math.round(x.rect.y)}–${Math.round(x.rect.y + x.rect.height)}`,
    )
  expect(bad, `${what} : commandes hors des zones sûres`).toEqual([])
}

for (const c of CASES) {
  test.describe(`bords de l’écran, 4 états — ${c.name}`, () => {
    test.use({
      viewport: { width: c.w, height: c.h },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })

    test('normal, vent, immersif, immersif + vent', async ({
      page,
      context,
      backend,
    }) => {
      void backend
      test.setTimeout(180_000)
      await applySafeArea(context, page, c.safe)
      await installWind(page)
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      const shot = (n: string) =>
        SHOTS
          ? page.screenshot({
              path: `docs/validation/bords-${n}-${c.w}x${c.h}.png`,
            })
          : Promise.resolve(null)

      // 1. Carte normale : navigation inchangée, aucun espace entre elle et le bas.
      await settled(page, c.w, c.h)
      const nav = page.getByRole('navigation', { name: 'Navigation principale' })
      if (c.w < 768) {
        await expect(nav).toBeVisible()
        const navRect = await rectOf(page, 'nav[aria-label="Navigation principale"]')
        expect(navRect && Math.abs(navRect.b - c.h)).toBeLessThanOrEqual(1)
        const canvas = await rectOf(page, 'canvas.maplibregl-canvas')
        expect(canvas && Math.abs(canvas.b - (navRect?.y ?? 0))).toBeLessThanOrEqual(1)
      }
      await shot('1-normal')

      // 2. Vent ouvert (hors immersif) : la feuille va jusqu'au bord bas.
      await openWind(page)
      await settled(page, c.w, c.h)
      const sheet2 = await rectOf(page, '[data-testid="wind-analysis"]')
      // Téléphone : jusqu'au bord bas. À partir de md (paysage 844 px), la carte est
      // une carte à marge de page : la feuille s'aligne sur le bas de la carte.
      const canvas2 = await rectOf(page, 'canvas.maplibregl-canvas')
      const expectedBottom = c.w < 768 ? c.h : (canvas2?.b ?? c.h)
      expect(sheet2 && Math.abs(sheet2.b - expectedBottom)).toBeLessThanOrEqual(1)
      await expect(nav).toHaveCount(0)
      await shot('2-vent')

      // 3. Immersif : la carte couvre TOUT le viewport, commandes dans les zones sûres.
      await page.reload()
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
      await page.getByRole('button', { name: 'Mode immersif' }).click()
      await expect(
        page.getByRole('button', { name: 'Quitter le mode immersif' }),
      ).toBeVisible()
      await expect
        .poll(async () => (await rectOf(page, 'canvas.maplibregl-canvas'))?.h ?? 0)
        .toBeGreaterThanOrEqual(c.h - 1)
      const m3 = await measureLayout(page)
      expect(Math.abs((m3.rects.canvas?.x ?? 99) - 0)).toBeLessThanOrEqual(1)
      expect(Math.abs((m3.rects.canvas?.y ?? 99) - 0)).toBeLessThanOrEqual(1)
      expect(Math.abs((m3.rects.canvas?.width ?? 0) - c.w)).toBeLessThanOrEqual(1)
      expect(Math.abs((m3.rects.canvas?.height ?? 0) - c.h)).toBeLessThanOrEqual(1)
      // Aucune bande « coque » : le point le plus bas et le plus haut sont la carte.
      const edges = await page.evaluate(() => {
        const at = (x: number, y: number) =>
          document.elementFromPoint(x, y)?.closest('[data-testid="map-container"]') !==
          null
        return {
          top: at(window.innerWidth / 2, 1),
          bottom: at(window.innerWidth / 2, window.innerHeight - 2),
        }
      })
      expect(edges).toEqual({ top: true, bottom: true })
      expectInsideSafe(m3.controls, c, 'immersif')
      // Les contrôles propres à MapLibre (boussole) sont bien mesurés.
      expect(
        m3.controls.some((x) => /nord|boussole|compass/i.test(x.label)),
        'boussole MapLibre mesurée',
      ).toBe(true)
      await shot('3-immersif')

      // 4. Immersif + vent : fond de feuille jusqu'au bas, commandes au-dessus de l'indicateur.
      await openWind(page)
      await settled(page, c.w, c.h)
      const sheet = await rectOf(page, '[data-testid="wind-analysis"]')
      expect(sheet).toBeTruthy()
      // Le cadre de la feuille s'arrête à la ligne sûre ; son fond est prolongé en dessous.
      expect(sheet && sheet.b).toBeLessThanOrEqual(c.h - c.safe.bottom + 1)
      const bottomHit = await page.evaluate(() => {
        const e = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 2)
        return e?.closest('[data-testid="wind-analysis"]') !== null
      })
      expect(bottomHit, 'le fond de la feuille couvre le bord bas').toBe(true)
      const fill = await page.evaluate(() => {
        const s = document.querySelector('[data-testid="wind-analysis"]')
        const after = s ? getComputedStyle(s, '::after') : null
        return after ? Math.round(Number.parseFloat(after.height)) : -1
      })
      expect(fill, 'prolongement du fond = zone sûre basse').toBe(c.safe.bottom)
      const m4 = await measureLayout(page)
      expectInsideSafe(m4.controls, c, 'immersif + vent')
      expect(Math.abs((m4.rects.canvas?.height ?? 0) - c.h)).toBeLessThanOrEqual(1)
      // « Arrêter le guidage » & co : le rail s'arrête au-dessus de la feuille.
      const problems = m4.controls.filter((x) => !x.hit).map((x) => x.label)
      expect(problems, 'commandes recouvertes').toEqual([])
      // La sortie de l'immersif reste atteignable pendant l'analyse (jamais masquée).
      const exit = page.getByRole('button', { name: 'Quitter le mode immersif' })
      await expect(exit).toBeVisible()
      const exitBox = await exit.boundingBox()
      expect(exitBox && sheet && exitBox.y + exitBox.height <= sheet.y + 1).toBe(true)
      await shot('4-immersif-vent')
    })
  })
}
