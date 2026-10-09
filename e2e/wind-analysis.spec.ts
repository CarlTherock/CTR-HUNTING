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
// Chaque jour a sa propre rotation de directions : jour 1, 2… 5 ne se confondent pas.
const dirOf = (index: number) => (index * 15 + Math.floor(index / 24) * 40) % 360
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

const forecastDaysAsked: (string | null)[] = []

async function installWind(page: Page) {
  await installAnalysisProviders(page)
  const times = hourlyTimes(5)
  await page.route('https://api.open-meteo.com/**', async (route) => {
    const url = new URL(route.request().url())
    const latitudes = (url.searchParams.get('latitude') ?? '').split(',')
    if (latitudes.length < 2) return route.fallback()
    forecastDaysAsked.push(url.searchParams.get('forecast_days'))
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
  { w: 320, h: 568, notch: false },
  { w: 390, h: 844, notch: true },
  { w: 430, h: 932, notch: true },
  { w: 568, h: 320, notch: false },
  { w: 844, h: 390, notch: true },
]

const shot = (name: string) =>
  process.env.E2E_SCREENSHOTS === '1' ? `docs/validation/vent-${name}.png` : null

async function rect(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }, selector)
}

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

    test('panneau pleine largeur ancré en bas, navigation masquée, 5 jours réels', async ({
      page,
      context,
      backend,
    }) => {
      void backend
      test.setTimeout(150_000)
      const inset = size.notch
        ? landscape
          ? IPHONE_LANDSCAPE_SAFE_AREA
          : IPHONE_PORTRAIT_SAFE_AREA
        : { top: 0, bottom: 0, left: 0, right: 0 }
      if (size.notch) await applySafeArea(context, page, inset)
      await installWind(page)
      await page.goto('map')
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()

      // Avant : navigation du bas visible (mobile), carte au-dessus d'elle.
      const nav = page.getByRole('navigation', { name: 'Navigation principale' })
      const navVisibleBefore = await nav.isVisible()
      const canvasBefore = await rect(page, 'canvas.maplibregl-canvas')
      const mapBefore = await rect(page, '[data-testid="map-container"]')
      if (size.w < 768) expect(navVisibleBefore).toBe(true)

      // Attributions : repliées au départ (pas de grand bloc de crédits).
      expect(
        await page.evaluate(
          () =>
            document.querySelector('.maplibregl-ctrl-attrib')?.hasAttribute('open') ??
            false,
        ),
        'attributions ouvertes par défaut',
      ).toBe(false)

      await openAnalysis(page)
      const now = currentIndex()
      await expect.poll(() => selected(page)).toBe(now)
      await expectReadout(page, now)

      // Une seule requête de prévision, sur 5 jours calendaires.
      expect(forecastDaysAsked.at(-1)).toBe('5')

      // Navigation masquée : absente (ni cliquable ni focalisable), sans hauteur vide.
      await expect(nav).toHaveCount(0)
      const sheet = await rect(page, '[data-testid="wind-analysis"]')
      const canvasOpen = await rect(page, 'canvas.maplibregl-canvas')
      if (!sheet || !canvasOpen || !canvasBefore || !mapBefore) throw new Error('mesure')
      // La carte occupe toute la surface : en mobile (< 768 px) elle descend
      // jusqu'au bas de l'écran (au-delà de l'ancienne barre) et la feuille
      // s'ancre sur ce bord ; dès `md`, la carte est une carte à marge de
      // page : la feuille s'ancre sur SON bord bas, sans bande vide dessous.
      const fullBleed = size.w < 768
      // (le canvas MapLibre suit le conteneur après un redimensionnement asynchrone)
      await expect
        .poll(async () => {
          const c = await rect(page, 'canvas.maplibregl-canvas')
          const want = fullBleed ? size.h : sheet.y + sheet.height
          return c ? Math.abs(c.y + c.height - want) < 1.5 : false
        })
        .toBe(true)
      void canvasOpen
      // (la carte à marge de page a une bordure de 1 px : tolérance de 2 px)
      expect(Math.abs(sheet.x - (fullBleed ? 0 : canvasOpen.x))).toBeLessThanOrEqual(2)
      expect(
        Math.abs(
          sheet.width -
            (fullBleed ? size.w - inset.left - inset.right : canvasOpen.width),
        ),
      ).toBeLessThanOrEqual(2)
      if (fullBleed) expect(sheet.y + sheet.height).toBeCloseTo(size.h, 0)
      // Majorité de la carte visible : la feuille ouverte reste sous ~45 % de l'écran
      // en portrait, et sous 60 % en paysage court.
      expect(sheet.height / size.h).toBeLessThan(landscape ? 0.6 : 0.45)

      // Cinq jours calendaires issus des données.
      const days = page.getByRole('group', { name: 'Jour de la prévision' })
      const dayButtons = days.getByRole('button')
      await expect(dayButtons).toHaveCount(5)
      await expect(dayButtons.nth(0)).toHaveText("Aujourd'hui")
      await expect(dayButtons.nth(1)).toHaveText('Demain')

      const shotOpen = shot(`analyse-${size.w}x${size.h}`)
      if (shotOpen) await page.screenshot({ path: shotOpen })

      // Commandes non coupées, cibles ≥ 44 px, dans les zones sûres. La rangée de
      // jours défile : seule la pastille active doit être entièrement visible.
      const m = await measureLayout(page, '[data-testid="wind-analysis"]')
      expect(m.document.scrollWidth).toBeLessThanOrEqual(m.document.clientWidth)
      // La rangée de jours défile : une pastille hors écran n'est pas « coupée ».
      const isDayChip = (label: string) =>
        /^(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\./.test(label) || /Demain|Aujourd/.test(label)
      const problems = m.controls
        .filter((c) => !c.rendered || (!isDayChip(c.label) && (!c.hit || !c.inViewport)))
        .map((c) => `${c.label} ${JSON.stringify(c.rect)} touchable=${c.hit}`)
      expect(problems, 'contrôles masqués ou coupés').toEqual([])
      const small = m.controls
        .filter((c) => c.rendered && c.minSide < 44)
        .map((c) => `${c.label} ${Math.round(c.rect.width)}x${Math.round(c.rect.height)}`)
      expect(small, 'cibles tactiles < 44 px').toEqual([])
      for (const c of m.controls.filter((x) => !isDayChip(x.label) || x.inViewport)) {
        if (size.w >= 768) break
        expect(
          c.rect.y + c.rect.height,
          `${c.label} sous la zone sûre du bas`,
        ).toBeLessThanOrEqual(size.h - inset.bottom + 0.5)
      }

      // Rail : plus de colonne complète, aucun bouton sous la feuille, outils
      // secondaires masqués, outils essentiels conservés.
      await expect(page.getByRole('button', { name: 'Outils', exact: true })).toHaveCount(
        0,
      )
      await expect(page.getByRole('button', { name: 'Mode immersif' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Couches' })).toHaveCount(0)
      const railButtons = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="map-tool-rail"] button')].map(
          (b) => {
            const r = b.getBoundingClientRect()
            return {
              label: b.getAttribute('aria-label') ?? b.textContent ?? '',
              bottom: r.bottom,
              rendered: r.width > 0 && r.height > 0,
            }
          },
        ),
      )
      for (const b of railButtons.filter((x) => x.rendered))
        expect(b.bottom, `${b.label} sous la feuille`).toBeLessThanOrEqual(sheet.y + 0.5)
      await expectReachable(page, [
        'Ajouter un repère',
        'Maintenant',
        "Fermer l'analyse du vent",
      ])

      // Glisser le curseur : l'heure partagée, les valeurs ET l'indice de rendu changent.
      const bar = page.getByTestId('wind-hour-bar')
      const box = await bar.boundingBox()
      if (!box) throw new Error('barre introuvable')
      const y = box.y + box.height / 2
      await page.mouse.move(box.x + box.width * 0.1, y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.5, y, { steps: 6 })
      await page.mouse.move(box.x + box.width * 0.9, y, { steps: 6 })
      await page.mouse.up()
      const dragged = await selected(page)
      expect(dragged).toBe(Math.round(0.9 * 23))
      await expectReadout(page, dragged)

      // Clavier.
      await bar.focus()
      await page.keyboard.press('ArrowLeft')
      expect(await selected(page)).toBe(dragged - 1)
      await expectReadout(page, dragged - 1)

      // Jour 5 : même heure, créneau 96 + h, avec SES valeurs (pas celles de demain).
      const hour = (dragged - 1) % 24
      await dayButtons.nth(4).click()
      expect(await selected(page)).toBe(96 + hour)
      await expectReadout(page, 96 + hour)
      expect(dirOf(96 + hour)).not.toBe(dirOf(24 + hour))
      const shotDay5 = shot(`analyse-jour5-${size.w}x${size.h}`)
      if (shotDay5) await page.screenshot({ path: shotDay5 })

      // Détails : hauteur supplémentaire seulement à la demande.
      const heightBeforeDetails = sheet.height
      await page.getByRole('button', { name: 'Source et détails' }).click()
      await expect(page.getByTestId('wind-details')).toBeVisible()
      await expect(page.getByTestId('wind-details')).toContainText('Open-Meteo')
      await expect(page.getByTestId('wind-details')).toContainText('Rendu indicatif')
      const withDetails = await rect(page, '[data-testid="wind-analysis"]')
      expect((withDetails?.height ?? 0) + 0.5).toBeGreaterThanOrEqual(heightBeforeDetails)
      expect(withDetails ? withDetails.height / size.h : 1).toBeLessThan(0.82)
      const shotDetails = shot(`analyse-details-${size.w}x${size.h}`)
      if (shotDetails) await page.screenshot({ path: shotDetails })
      await page.getByRole('button', { name: 'Source et détails' }).click()

      // Rotation : sélection (jour 5) et état ouvert conservés.
      await page.setViewportSize({ width: size.h, height: size.w })
      await expect(page.getByTestId('wind-analysis')).toBeVisible()
      expect(await selected(page)).toBe(96 + hour)
      await page.setViewportSize({ width: size.w, height: size.h })

      // Maintenant : revient à l'heure actuelle, pas à l'heure choisie.
      await page.getByRole('button', { name: 'Maintenant' }).click()
      expect(await selected(page)).toBe(now)
      await expectReadout(page, now)

      // Replié : une ligne, navigation toujours masquée, attributions au-dessus.
      await page.getByRole('button', { name: "Replier l'analyse du vent" }).click()
      const collapsed = page.getByTestId('wind-analysis')
      await expect(collapsed).toHaveAttribute('data-state', 'collapsed')
      await expect(collapsed).toContainText(`${speedOf(now)} km/h`)
      await expect(collapsed).toContainText(`du ${label(dirOf(now))}`)
      await expect(nav).toHaveCount(0)
      const slim = await rect(page, '[data-testid="wind-analysis"]')
      expect(slim?.height ?? 999).toBeLessThan(landscape ? 80 : 100 + inset.bottom)
      const attrib = await rect(page, '.maplibregl-ctrl-attrib')
      if (attrib && slim)
        expect(
          attrib.y + attrib.height,
          'attributions sous la feuille',
        ).toBeLessThanOrEqual(slim.y + 0.5)
      const shotCollapsed = shot(`analyse-replie-${size.w}x${size.h}`)
      if (shotCollapsed) await page.screenshot({ path: shotCollapsed })

      // Fermer : la navigation revient, la carte retrouve sa taille, l'heure reste.
      await page.getByRole('button', { name: "Fermer l'analyse du vent" }).click()
      await expect(page.getByTestId('wind-analysis')).toHaveCount(0)
      if (size.w < 768) await expect(nav).toBeVisible()
      const mapAfter = await rect(page, '[data-testid="map-container"]')
      expect(Math.abs((mapAfter?.height ?? 0) - mapBefore.height)).toBeLessThanOrEqual(1)
      expect(Math.abs((mapAfter?.width ?? 0) - mapBefore.width)).toBeLessThanOrEqual(1)
      // Rouvrir (le panneau météo, rouvert à la fermeture, porte le bouton) :
      // la même heure partagée est toujours là.
      await page.getByRole('button', { name: 'Analyse du vent' }).click()
      await expect(page.getByTestId('wind-analysis')).toBeVisible()
      expect(await selected(page)).toBe(now)
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
