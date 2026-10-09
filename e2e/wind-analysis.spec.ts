import type { Page } from '@playwright/test'
import {
  applySafeArea,
  IPHONE_LANDSCAPE_SAFE_AREA,
  IPHONE_PORTRAIT_SAFE_AREA,
  measureLayout,
} from './support/layout'
import { hourlyTimes, installAnalysisProviders } from './support/analysisProviders'
import { expectReachable } from './support/reachable'
import { createWaypointViaUi } from './support/waypointData'
import { expect, test } from './support/test'

/**
 * « Analyse du vent » : panneau du bas + barre de temps.
 *
 * Chromium UNIQUEMENT, carte, GPS et prévisions SIMULÉS : ces tests prouvent
 * la logique et la disposition de l'application, pas un iPhone réel ni la
 * justesse d'Open-Meteo. Le fournisseur simulé donne à CHAQUE heure une
 * direction et une vitesse différentes (direction = 15° × indice, vitesse =
 * 5 + indice km/h), pour qu'une valeur lue à l'écran prouve le bon créneau.
 */
const TZ = 'America/Toronto'
const LABELS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSO',
  'SO',
  'OSO',
  'O',
  'ONO',
  'NO',
  'NNO',
]
const label = (deg: number) => LABELS[Math.round(deg / 22.5) % 16]
const dirOf = (index: number) => (index * 15) % 360
const speedOf = (index: number) => 5 + index

function currentIndex(): number {
  const hour = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()),
  )
  return hour // index 0 = minuit local d'aujourd'hui
}

async function installWind(page: Page) {
  await installAnalysisProviders(page)
  const times = hourlyTimes()
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url())
    const latitudes = (url.searchParams.get('latitude') ?? '').split(',')
    if (latitudes.length < 2) return route.fallback()
    const body = latitudes.map(() => ({
      timezone: TZ,
      hourly: {
        time: times,
        wind_speed_10m: times.map((_, i) => speedOf(i)),
        wind_direction_10m: times.map((_, i) => dirOf(i)),
        wind_gusts_10m: times.map((_, i) => speedOf(i) + 8),
        temperature_2m: times.map(() => 12),
        precipitation: times.map(() => 0),
        cloud_cover: times.map(() => 20),
      },
    }))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    })
  })
}

async function openAnalysis(page: Page) {
  await page.goto('map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Météo et radar' }).click()
  await page.getByRole('button', { name: 'Analyse du vent' }).click()
  await expect(page.getByTestId('wind-analysis')).toBeVisible()
  await expect(page.getByTestId('wind-readout')).toBeVisible()
}

async function selected(page: Page): Promise<number> {
  return Number(
    await page
      .getByRole('slider', { name: 'Heure de la prévision de vent' })
      .getAttribute('aria-valuenow'),
  )
}

async function expectReadout(page: Page, index: number) {
  const readout = page.getByTestId('wind-readout')
  await expect(readout).toContainText(`${speedOf(index)} km/h`)
  await expect(readout).toContainText(`Vent du ${label(dirOf(index))}`)
  await expect(readout).toContainText(`(${dirOf(index)}°)`)
}

const SIZES = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
  { w: 568, h: 320 },
  { w: 844, h: 390 },
]

for (const size of SIZES) {
  const landscape = size.w > size.h
  test.describe(`analyse du vent ${size.w}x${size.h}`, () => {
    test.use({
      viewport: { width: size.w, height: size.h },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })

    test('disposition, barre manipulable, jours, Maintenant et rotation', async ({
      page,
      context,
      backend,
    }) => {
      void backend
      test.setTimeout(120_000)
      // 320×568 et 568×320 sont des iPhone SE (sans encoche) : pas de zones sûres.
      if (Math.max(size.w, size.h) > 600)
        await applySafeArea(
          context,
          page,
          landscape ? IPHONE_LANDSCAPE_SAFE_AREA : IPHONE_PORTRAIT_SAFE_AREA,
        )
      await installWind(page)
      await openAnalysis(page)

      // Démarre à l'heure courante, avec les vraies valeurs du créneau.
      const now = currentIndex()
      await expect.poll(() => selected(page)).toBe(now)
      await expectReadout(page, now)

      // Jours : uniquement ceux que la prévision de 48 h couvre.
      const days = page.getByRole('group', { name: 'Jour de la prévision' })
      await expect(days.getByRole('button')).toHaveText(["Aujourd'hui", 'Demain'])

      if (process.env.E2E_SCREENSHOTS === '1')
        await page.screenshot({
          path: `docs/validation/vent-analyse-${size.w}x${size.h}.png`,
        })

      // Disposition : rien n'est masqué, cibles ≥ 44 px. En paysage court le pied
      // (source, figer) défile dans la feuille : seules les commandes essentielles
      // doivent être visibles sans défiler.
      const m = await measureLayout(page, '[data-testid="wind-analysis"]')
      expect(m.document.scrollWidth).toBeLessThanOrEqual(m.document.clientWidth)
      const essential = (c: { label: string }) =>
        /Maintenant|Fermer|Replier|Aujourd|Demain/.test(c.label)
      const checked = size.h <= 480 ? m.controls.filter(essential) : m.controls
      expect(checked.length).toBeGreaterThanOrEqual(4)
      const problems = checked
        .filter((c) => !c.rendered || !c.hit || !c.inViewport)
        .map((c) => `${c.label} ${JSON.stringify(c.rect)} touchable=${c.hit}`)
      expect(problems, 'contrôles masqués ou coupés').toEqual([])
      const small = checked
        .filter((c) => c.rendered && c.minSide < 44)
        .map((c) => `${c.label} ${Math.round(c.rect.width)}x${Math.round(c.rect.height)}`)
      expect(small, 'cibles tactiles < 44 px').toEqual([])
      const panel = await page.getByTestId('wind-analysis').boundingBox()
      const nav = await page.getByRole('navigation').first().boundingBox()
      expect(panel).not.toBeNull()
      if (panel && nav) {
        expect(panel.x).toBeGreaterThanOrEqual(-0.5)
        expect(panel.x + panel.width).toBeLessThanOrEqual(size.w + 0.5)
        // jamais sur la navigation principale (barre du bas, ou colonne de gauche
        // en paysage large), ni sur le rail d'outils (à droite)
        if (nav.width > nav.height)
          expect(panel.y + panel.height).toBeLessThanOrEqual(nav.y + 0.5)
        else expect(panel.x).toBeGreaterThanOrEqual(nav.x + nav.width - 0.5)
        const rail = await page.getByTestId('map-tool-rail').boundingBox()
        if (rail) expect(panel.x + panel.width).toBeLessThanOrEqual(rail.x + 0.5)
        expect(panel.height).toBeLessThanOrEqual(size.h * 0.8)
      }
      await expectReachable(page, ['Maintenant', "Fermer l'analyse du vent"])

      // Glisser le curseur : l'heure partagée, les valeurs ET l'indice de rendu changent.
      const bar = page.getByTestId('wind-hour-bar')
      const box = await bar.boundingBox()
      expect(box).not.toBeNull()
      if (!box) return
      const y = box.y + box.height / 2
      await page.mouse.move(box.x + box.width * 0.1, y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.5, y, { steps: 6 })
      await page.mouse.move(box.x + box.width * 0.9, y, { steps: 6 })
      await page.mouse.up()
      const dragged = await selected(page)
      expect(dragged).toBeGreaterThan(now > 20 ? 0 : 0)
      expect(dragged).toBe(Math.round(0.9 * 23)) // jour d'aujourd'hui : 24 créneaux
      await expectReadout(page, dragged)

      // Clavier.
      await bar.focus()
      await page.keyboard.press('ArrowLeft')
      expect(await selected(page)).toBe(dragged - 1)
      await expectReadout(page, dragged - 1)

      // Demain : même heure, créneau +24.
      const hour = (dragged - 1) % 24
      await page.getByRole('button', { name: 'Demain' }).click()
      expect(await selected(page)).toBe(24 + hour)
      await expectReadout(page, 24 + hour)

      // Rotation : la sélection et l'état ouvert sont conservés.
      await page.setViewportSize({ width: size.h, height: size.w })
      await expect(page.getByTestId('wind-analysis')).toBeVisible()
      expect(await selected(page)).toBe(24 + hour)

      // Maintenant.
      await page.setViewportSize({ width: size.w, height: size.h })
      await page.getByRole('button', { name: 'Maintenant' }).click()
      expect(await selected(page)).toBe(now)
      await expectReadout(page, now)

      // Replié : date/heure, direction d'origine et vitesse.
      await page.getByRole('button', { name: "Replier l'analyse du vent" }).click()
      const collapsed = page.getByTestId('wind-analysis')
      await expect(collapsed).toHaveAttribute('data-state', 'collapsed')
      await expect(collapsed).toContainText(`${speedOf(now)} km/h`)
      await expect(collapsed).toContainText(`du ${label(dirOf(now))}`)
      if (process.env.E2E_SCREENSHOTS === '1')
        await page.screenshot({
          path: `docs/validation/vent-analyse-replie-${size.w}x${size.h}.png`,
        })
    })
  })
}

test.describe('analyse du vent : sans chevauchement avec le guidage', () => {
  for (const size of [
    { w: 390, h: 844 },
    { w: 568, h: 320 },
  ]) {
    test.describe(`${size.w}x${size.h}`, () => {
      test.use({
        viewport: { width: size.w, height: size.h },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
        permissions: ['geolocation'],
        geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
      })

      test('« Arrêter le guidage » et « + Repère » restent atteignables', async ({
        page,
        backend,
      }) => {
        void backend
        test.setTimeout(120_000)
        await installWind(page)
        await page.goto('map')
        await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
        const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox()
        if (!canvas) throw new Error('no canvas')
        await createWaypointViaUi(page, 'Mirador nord', {
          x: Math.round(canvas.width / 2) - 40,
          // sous la bannière « placer le repère », qui couvre le haut en paysage court
          y: Math.round(canvas.height * 0.62),
        })
        await page.getByTestId('waypoint-marker').first().click()
        await page.getByRole('button', { name: 'Aller à', exact: true }).click()
        await expect(page.getByTestId('guidance-panel')).toBeVisible()

        await page.getByRole('button', { name: 'Météo et radar' }).click()
        await page.getByRole('button', { name: 'Analyse du vent' }).click()
        await expect(page.getByTestId('wind-analysis')).toBeVisible()

        const landscape = size.w > size.h
        if (landscape) {
          // Paysage court : la feuille reste une barre d'une ligne, l'heure réglable.
          await expect(page.getByTestId('wind-analysis')).toHaveAttribute(
            'data-state',
            'collapsed',
          )
          // attend les vraies valeurs (la prévision arrive après l'ouverture)
          await expect(page.getByTestId('wind-analysis')).toContainText(/\d\d:00/)
          const before = Number(
            (await page.getByTestId('wind-analysis').textContent())?.match(
              /(\d\d):00/,
            )?.[1],
          )
          await page.getByRole('button', { name: 'Heure suivante' }).click()
          await expect(page.getByTestId('wind-analysis')).toContainText(
            `${String((before + 1) % 24).padStart(2, '0')}:00`,
          )
        }
        await expectReachable(page, [
          'Arrêter le guidage',
          'Ajouter un repère',
          ...(landscape
            ? ['Heure suivante']
            : ["Fermer l'analyse du vent", 'Maintenant']),
        ])
        const analysis = await page.getByTestId('wind-analysis').boundingBox()
        const guidance = await page.getByTestId('guidance-panel').boundingBox()
        if (analysis && guidance) {
          const overlapY =
            analysis.y < guidance.y + guidance.height &&
            analysis.y + analysis.height > guidance.y
          const overlapX =
            analysis.x < guidance.x + guidance.width &&
            analysis.x + analysis.width > guidance.x
          expect(overlapX && overlapY, 'la feuille recouvre le guidage').toBe(false)
        }
        if (process.env.E2E_SCREENSHOTS === '1')
          await page.screenshot({
            path: `docs/validation/vent-analyse-guidage-${size.w}x${size.h}.png`,
          })
      })
    })
  }
})
