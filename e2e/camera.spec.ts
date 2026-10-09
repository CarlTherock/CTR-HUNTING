import type { Page } from '@playwright/test'
import { BACKGROUND_RGB, PATCH, PATCH_RGB, installFakeCamera } from './support/fakeCamera'
import { colorsClose, pixelAt } from './support/pixels'
import { expectReachable } from './support/reachable'
import { expect, test } from './support/test'
import { VIEWPORTS, type ViewportCase } from './support/viewports'
import {
  coverTransform,
  sourceToDisplay,
} from '../src/features/blood/camera/coverMapping'
import { HIGHLIGHT_RGB } from '../src/features/blood/camera/bloodHighlight'

/**
 * Caméra de sang immersive. Chromium uniquement ; carte, GPS et caméra
 * SIMULÉS (image canvas de taille connue, géolocalisation Playwright) :
 * ceci mesure la mise en page et le recadrage, mais ne valide NI Safari
 * NI un iPhone réel (barres système, torche, flux vidéo).
 */
const SIZES: readonly ViewportCase[] = [
  VIEWPORTS.find((v) => v.name === '320x568'),
  VIEWPORTS.find((v) => v.name === '390x844'),
  VIEWPORTS.find((v) => v.name === '430x932'),
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
  { name: '844x390 (paysage)', width: 844, height: 390, mobile: true },
].filter((v): v is ViewportCase => v !== undefined)
const SHOT_SIZES = new Set(['390x844', '568x320', '320x568'])
const SOURCE = { width: 1280, height: 720 }

async function shot(page: Page, size: ViewportCase, name: string) {
  const slug = size.name.split(' ')[0] ?? size.name
  if (process.env.E2E_SCREENSHOTS === '1' && SHOT_SIZES.has(slug)) {
    await page.screenshot({ path: `docs/validation/camera-${name}-${slug}.png` })
  }
}

async function readAll<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction(name, 'readonly').objectStore(name).getAll()
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        }
      }) as Promise<T[]>,
    store,
  )
}

async function openCamera(page: Page) {
  await page.goto('map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Outils' }).click()
  await page.getByRole('button', { name: 'Caméra sang' }).click()
  await expect(page.getByTestId('blood-camera')).toBeVisible()
}

async function waitForFilteredFrame(page: Page) {
  await expect(page.getByRole('button', { name: 'Capturer', exact: true })).toBeEnabled()
  // A frame has been analysed once the candidate zone is reported.
  await expect(page.getByTestId('candidate-alert')).toBeVisible({ timeout: 20_000 })
}

async function box(page: Page, selector: string) {
  const rect = await page.locator(selector).first().boundingBox()
  if (!rect) throw new Error(`${selector} introuvable`)
  return rect
}

/** Where the red patch is on screen, from the real size of the stage and the
 * `object-fit: cover` relation (not guessed from a screenshot). */
async function patchOnScreen(page: Page) {
  const stage = await box(page, '[data-testid="camera-stage"]')
  const t = coverTransform(SOURCE.width, SOURCE.height, stage.width, stage.height)
  const topLeft = sourceToDisplay(t, {
    x: SOURCE.width * PATCH.x,
    y: SOURCE.height * PATCH.y,
  })
  const bottomRight = sourceToDisplay(t, {
    x: SOURCE.width * (PATCH.x + PATCH.w),
    y: SOURCE.height * (PATCH.y + PATCH.h),
  })
  return {
    left: stage.x + topLeft.x,
    top: stage.y + topLeft.y,
    right: stage.x + bottomRight.x,
    bottom: stage.y + bottomRight.y,
    stage,
  }
}

function highlighted(
  rgb: readonly [number, number, number],
  color: keyof typeof HIGHLIGHT_RGB,
) {
  // The engine blends 80 % highlight colour + 20 % of the source pixel.
  const [hr, hg, hb] = HIGHLIGHT_RGB[color]
  const expected = [
    Math.round(hr * 0.8 + PATCH_RGB[0] * 0.2),
    Math.round(hg * 0.8 + PATCH_RGB[1] * 0.2),
    Math.round(hb * 0.8 + PATCH_RGB[2] * 0.2),
  ] as const
  return colorsClose(rgb, expected, 32)
}

for (const size of SIZES) {
  test.describe(`caméra immersive ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.mobile,
      isMobile: size.mobile,
      deviceScaleFactor: 2,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })

    test.beforeEach(async ({ page, backend }) => {
      void backend
      await installFakeCamera(page, { torch: true })
    })

    test('l’image couvre toute la surface ; commandes visibles, cliquables et entières ; aucune bande vide', async ({
      page,
    }) => {
      await openCamera(page)
      await waitForFilteredFrame(page)

      // The dialog, the stage and both image layers are the whole viewport.
      for (const selector of [
        '[data-testid="blood-camera"]',
        '[data-testid="camera-stage"]',
        'video[aria-label="Image originale de la caméra"]',
        'canvas[aria-label="Image avec surbrillance des zones candidates"]',
      ]) {
        const rect = await box(page, selector)
        expect(rect.x, selector).toBeCloseTo(0, 0)
        expect(rect.y, selector).toBeCloseTo(0, 0)
        expect(rect.width, selector).toBeCloseTo(size.width, 0)
        expect(rect.height, selector).toBeCloseTo(size.height, 0)
      }
      // No unexplained dark band: the corners and the bottom edge show the image.
      for (const [x, y] of [
        [2, 2],
        [size.width - 3, 2],
        [2, size.height - 3],
        [size.width - 3, size.height - 3],
        [size.width / 2, size.height - 3],
      ] as const) {
        const rgb = await pixelAt(page, x, y)
        expect(rgb[0] + rgb[1] + rgb[2], `pixel (${x}, ${y}) noir`).toBeGreaterThan(60)
      }

      await expectReachable(page, [
        'Fermer la caméra',
        'Allumer la lampe',
        'Paramètres',
        'Aide et informations',
        /Aide visuelle — sang non confirmé/,
        'Filtrée',
        'Originale',
        'Comparaison',
        'Capturer',
        /\+ Repère/,
      ])
      // No page scroll was needed to reach anything.
      const scroll = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
      }))
      expect(scroll.x).toBeLessThanOrEqual(0)
      expect(scroll.y).toBeLessThanOrEqual(0)
      await shot(page, size, 'immersive-filtree')

      // Same checks after turning the phone.
      await page.setViewportSize({ width: size.height, height: size.width })
      await expectReachable(page, [
        'Fermer la caméra',
        'Capturer',
        /\+ Repère/,
        'Paramètres',
      ])
      const rotated = await box(page, '[data-testid="camera-stage"]')
      expect(rotated.width).toBeCloseTo(size.height, 0)
      expect(rotated.height).toBeCloseTo(size.width, 0)
    })

    test('vidéo et filtre ont le même recadrage : la surbrillance tombe sur la tache, sans décalage', async ({
      page,
    }) => {
      await openCamera(page)
      await waitForFilteredFrame(page)
      const p = await patchOnScreen(page)
      const cx = (p.left + p.right) / 2
      const cy = (p.top + p.bottom) / 2
      const margin = Math.min(10, (p.right - p.left) / 4)

      // Filtered: highlight colour inside the patch, not outside (all sides).
      expect(highlighted(await pixelAt(page, cx, cy), 'yellow')).toBe(true)
      for (const [x, y] of [
        [p.left + margin, p.top + margin],
        [p.right - margin, p.bottom - margin],
      ] as const) {
        expect(
          highlighted(await pixelAt(page, x, y), 'yellow'),
          `dedans (${x}, ${y})`,
        ).toBe(true)
      }
      for (const [x, y] of [
        [p.left - margin, cy],
        [p.right + margin, cy],
        [cx, p.top - margin],
        [cx, p.bottom + margin],
      ] as const) {
        expect(
          highlighted(await pixelAt(page, x, y), 'yellow'),
          `dehors (${x}, ${y})`,
        ).toBe(false)
      }

      // Original: the same pixel positions show the untouched red patch.
      await page.getByRole('button', { name: 'Originale', exact: true }).click()
      expect(colorsClose(await pixelAt(page, cx, cy), PATCH_RGB, 30)).toBe(true)
      expect(
        colorsClose(await pixelAt(page, p.left - margin, cy), BACKGROUND_RGB, 30),
      ).toBe(true)
      expect(
        colorsClose(await pixelAt(page, p.right + margin, cy), BACKGROUND_RGB, 30),
      ).toBe(true)
    })

    test('comparaison : une seule image coupée par un séparateur réglable', async ({
      page,
    }) => {
      await openCamera(page)
      await waitForFilteredFrame(page)
      await page.getByRole('button', { name: 'Comparaison', exact: true }).click()
      const divider = page.getByRole('slider', { name: 'Séparateur de comparaison' })
      await expect(divider).toBeVisible()
      await expectReachable(page, ['Comparaison', 'Capturer'])
      await shot(page, size, 'comparaison')

      const p = await patchOnScreen(page)
      const cx = (p.left + p.right) / 2
      const cy = (p.top + p.bottom) / 2
      // Divider far right: the patch is on the filtered side.
      await divider.focus()
      for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
      await expect(divider).toHaveAttribute('aria-valuenow', '90')
      expect(highlighted(await pixelAt(page, cx, cy), 'yellow')).toBe(true)
      // Divider far left: the patch is on the original side — same crop.
      for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowLeft')
      await expect(divider).toHaveAttribute('aria-valuenow', '10')
      expect(colorsClose(await pixelAt(page, cx, cy), PATCH_RGB, 30)).toBe(true)

      // The divider also follows a finger / mouse drag.
      const handle = await divider.boundingBox()
      if (!handle) throw new Error('séparateur introuvable')
      await page.mouse.move(handle.x + handle.width / 2, size.height * 0.4)
      await page.mouse.down()
      await page.mouse.move(size.width * 0.7, size.height * 0.4, { steps: 4 })
      await page.mouse.up()
      const value = Number(await divider.getAttribute('aria-valuenow'))
      expect(value).toBeGreaterThan(60)
      expect(value).toBeLessThanOrEqual(90)
    })

    test('paramètres : feuille bornée au viewport, flux toujours derrière, réglages conservés', async ({
      page,
    }) => {
      await openCamera(page)
      await waitForFilteredFrame(page)
      await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
      const sheet = page.getByTestId('camera-settings')
      await expect(sheet).toBeVisible()
      const rect = await sheet.boundingBox()
      if (!rect) throw new Error('feuille introuvable')
      expect(rect.x).toBeGreaterThanOrEqual(-0.5)
      expect(rect.y).toBeGreaterThanOrEqual(-0.5)
      expect(rect.x + rect.width).toBeLessThanOrEqual(size.width + 0.5)
      expect(rect.y + rect.height).toBeLessThanOrEqual(size.height + 0.5)
      // The close button is always reachable and the lamp stays reachable.
      await expectReachable(page, ['Fermer : Paramètres'])
      await expect(page.getByRole('button', { name: 'Allumer la lampe' })).toBeVisible()
      // The stream keeps running behind the sheet.
      const state = await page.evaluate(() => {
        const video = document.querySelector('video')
        return video
          ? { paused: video.paused, ended: video.ended, w: video.videoWidth }
          : null
      })
      expect(state?.paused).toBe(false)
      expect(state?.w).toBe(SOURCE.width)
      await shot(page, size, 'parametres')

      // The four colours are offered; the choice is kept after closing.
      for (const label of ['Jaune', 'Cyan', 'Bleu', 'Rouge']) {
        await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
      }
      await page.getByRole('button', { name: 'Bleu', exact: true }).click()
      await page.getByRole('button', { name: 'Fermer : Paramètres' }).click()
      await expect(sheet).toHaveCount(0)
      await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
      await expect(
        page.getByRole('button', { name: 'Bleu', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'Fermer : Paramètres' }).click()
      await expectReachable(page, ['Capturer', /\+ Repère/])
    })

    for (const color of ['yellow', 'cyan', 'blue', 'red'] as const) {
      const label = { yellow: 'Jaune', cyan: 'Cyan', blue: 'Bleu', red: 'Rouge' }[color]
      test(`couleur ${label} : la tache est surlignée de cette couleur, la scène reste lisible`, async ({
        page,
      }) => {
        await openCamera(page)
        await waitForFilteredFrame(page)
        await page.getByRole('button', { name: 'Paramètres', exact: true }).click()
        await page.getByRole('button', { name: label, exact: true }).click()
        await page.getByRole('button', { name: 'Fermer : Paramètres' }).click()
        const p = await patchOnScreen(page)
        const cx = (p.left + p.right) / 2
        const cy = (p.top + p.bottom) / 2
        await expect
          .poll(async () => highlighted(await pixelAt(page, cx, cy), color))
          .toBe(true)
        // The scene is not tinted as a whole: the background keeps its green
        // (attenuated), it is not the highlight colour.
        const background = await pixelAt(page, p.left - 12, cy)
        expect(highlighted(background, color)).toBe(false)
        expect(background[1]).toBeGreaterThan(background[2])
      })
    }

    test('+ Repère depuis la caméra : feuille entière, position GPS avec précision, indice avec photo après choix explicite de la recherche', async ({
      page,
    }) => {
      await openCamera(page)
      await waitForFilteredFrame(page)
      await page.getByRole('button', { name: /\+ Repère/ }).click()
      const sheet = page.getByTestId('camera-mark')
      await expect(sheet).toBeVisible()
      await expect(page.getByTestId('mark-gps')).toContainText('±', { timeout: 20_000 })
      await expectReachable(page, ['Enregistrer l’indice ici', 'Fermer : + Repère'])
      await shot(page, size, 'repere')

      // Capture first, keep it, then join it on request.
      await page.getByRole('button', { name: 'Fermer : + Repère' }).click()
      await page.getByRole('button', { name: 'Capturer', exact: true }).click()
      const review = page.getByTestId('capture-review')
      await expect(review).toBeVisible()
      await expectReachable(page, [
        'Confirmer un indice',
        'Garder et revenir à la caméra',
        'Écarter cette capture',
      ])
      await page.getByRole('button', { name: 'Garder et revenir à la caméra' }).click()
      await expect(review).toHaveCount(0)
      expect(await readAll(page, 'waypoints')).toHaveLength(0)

      await page.getByRole('button', { name: /\+ Repère/ }).click()
      const attach = page.getByRole('checkbox', { name: /Joindre la capture/ })
      await expect(attach).not.toBeChecked()
      await attach.check()
      await page.getByTestId('mark-save').click()
      // No search is open: nothing is created or started until the user chooses.
      await expect(page.getByTestId('clue-gate')).toBeVisible()
      expect(await readAll(page, 'waypoints')).toHaveLength(0)
      expect(await readAll(page, 'bloodSessions')).toHaveLength(0)
      await page
        .getByRole('button', { name: /Créer une recherche et démarrer ma trace/ })
        .click()
      await expect.poll(async () => (await readAll(page, 'waypoints')).length).toBe(1)
      await expect.poll(async () => (await readAll(page, 'photos')).length).toBe(1)
      const [clue] = await readAll<{
        category: string
        origin?: string
        sessionId?: string
      }>(page, 'waypoints')
      expect(clue).toMatchObject({ category: 'blood', origin: 'gps' })
      expect(clue?.sessionId).toBeTruthy()
      // Back on the camera, same stream, confirmation shown, nothing duplicated.
      await expect(page.getByTestId('camera-notice')).toContainText('enregistré')
      await expect(page.getByTestId('camera-mark')).toHaveCount(0)
      await expectReachable(page, ['Capturer', /\+ Repère/])
      expect(await readAll(page, 'waypoints')).toHaveLength(1)
      const tracks = await page.evaluate(
        () =>
          (window as unknown as { __cameraTracks: MediaStreamTrack[] }).__cameraTracks
            .length,
      )
      expect(tracks).toBe(1)
    })

    test('fermer libère toutes les pistes ; rouvrir relance une caméra neuve', async ({
      page,
    }) => {
      await openCamera(page)
      await waitForFilteredFrame(page)
      await page.getByRole('button', { name: 'Fermer la caméra' }).click()
      await expect(page.getByTestId('blood-camera')).toHaveCount(0)
      const ended = await page.evaluate(() =>
        (
          window as unknown as { __cameraTracks: MediaStreamTrack[] }
        ).__cameraTracks.every((track) => track.readyState === 'ended'),
      )
      expect(ended).toBe(true)
      await expectReachable(page, ['Ajouter un repère', 'Outils'])

      await page.getByRole('button', { name: 'Outils' }).click()
      await page.getByRole('button', { name: 'Caméra sang' }).click()
      await waitForFilteredFrame(page)
      const live = await page.evaluate(
        () =>
          (
            window as unknown as { __cameraTracks: MediaStreamTrack[] }
          ).__cameraTracks.filter((track) => track.readyState === 'live').length,
      )
      expect(live).toBe(1)
    })

    test('lampe : la commande est envoyée à la piste, puis l’état « allumée » est affiché', async ({
      page,
    }) => {
      await openCamera(page)
      await waitForFilteredFrame(page)
      await page.getByRole('button', { name: 'Allumer la lampe' }).click()
      await expect(
        page.getByRole('button', { name: 'Éteindre la lampe' }),
      ).toHaveAttribute('aria-pressed', 'true')
      const requests = await page.evaluate(
        () => (window as unknown as { __torch: boolean[] }).__torch,
      )
      expect(requests).toEqual([true])
    })
  })

  test.describe(`caméra : refus de permission ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.mobile,
      isMobile: size.mobile,
    })
    test('reste utilisable : message, réessayer, importer, fermer', async ({
      page,
      backend,
    }) => {
      void backend
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: {
            getUserMedia: () =>
              Promise.reject(new DOMException('denied', 'NotAllowedError')),
            enumerateDevices: async () => [],
          },
        })
      })
      await openCamera(page)
      await expect(page.getByRole('alert').first()).toContainText('refusé')
      await expectReachable(page, [
        'Fermer la caméra',
        /Réessayer la caméra/,
        /Importer une photo/,
        'Capturer',
        /\+ Repère/,
      ])
      await shot(page, size, 'refusee')
    })
  })
}

test.describe('caméra : GPS absent', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    permissions: [],
  })
  test('+ Repère n’enregistre pas à une position inventée : le choix est la carte', async ({
    page,
    backend,
  }) => {
    void backend
    await installFakeCamera(page)
    await openCamera(page)
    await expect(
      page.getByRole('button', { name: 'Capturer', exact: true }),
    ).toBeEnabled()
    await page.getByRole('button', { name: /\+ Repère/ }).click()
    await expect(page.getByTestId('mark-gps')).toContainText('Position GPS indisponible')
    await expect(page.getByTestId('mark-save')).toBeDisabled()
    await expectReachable(page, [/Placer sur la carte/, 'Fermer : + Repère'])
    // « Sang / indice » with no open search: the gate comes first, nothing starts.
    await page.getByRole('button', { name: /Placer sur la carte/ }).click()
    await expect(page.getByTestId('clue-gate')).toBeVisible()
    expect(await readAll(page, 'bloodSessions')).toHaveLength(0)
    await page.getByRole('button', { name: 'Annuler', exact: true }).click()
    // An ordinary repère needs no search: the user places it on the map.
    await page.getByRole('button', { name: 'Repère normal' }).click()
    await page.getByRole('button', { name: /Placer sur la carte/ }).click()
    // The camera steps aside, says so, and the map can be tapped.
    const placing = page.getByTestId('camera-placing')
    await expect(placing).toContainText('Caméra en pause')
    expect(await readAll(page, 'waypoints')).toHaveLength(0)
    await page.getByRole('button', { name: 'Retour à la caméra' }).click()
    await expect(placing).toHaveCount(0)
    // The same stream is back: no second one was opened.
    const opened = await page.evaluate(
      () =>
        (window as unknown as { __cameraTracks: MediaStreamTrack[] }).__cameraTracks
          .length,
    )
    expect(opened).toBe(1)
    await expect(
      page.getByRole('button', { name: 'Capturer', exact: true }),
    ).toBeEnabled()
  })
})
