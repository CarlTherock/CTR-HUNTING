import type { Page } from '@playwright/test'
import { VIEWPORTS, type ViewportCase } from './support/viewports'
import { expectReachable } from './support/reachable'
import { expect, test } from './support/test'

/**
 * Parcours terrain : « + Repère », indice sang depuis « + Repère », caméra sang
 * sans recherche, « Après le tir », appui long. Chromium uniquement ; carte,
 * GPS et caméra SIMULÉS (géolocalisation Playwright, getUserMedia refusé) :
 * ceci ne valide PAS un iPhone réel (ni WebKit).
 */
const SIZES: readonly ViewportCase[] = [
  ...VIEWPORTS.filter((v) => !v.name.startsWith('844x390')),
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
  { name: '844x390 (paysage)', width: 844, height: 390, mobile: true },
]
const SHOT_SIZES = new Set(['390x844', '568x320', '320x568'])

async function shot(page: Page, size: ViewportCase, name: string) {
  const slug = size.name.split(' ')[0] ?? size.name
  if (process.env.E2E_SCREENSHOTS === '1' && SHOT_SIZES.has(slug)) {
    await page.screenshot({ path: `docs/validation/terrain-${name}-${slug}.png` })
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

interface StoredClue {
  sessionId?: string
  bloodKind?: string
  category: string
  origin?: string
}

async function openMap(page: Page) {
  await page.goto('map')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
}

async function openSheet(page: Page) {
  await page.getByRole('button', { name: 'Ajouter un repère', exact: true }).click()
  const sheet = page.getByTestId('add-point-sheet')
  await expect(sheet).toBeVisible()
  return sheet
}

async function expectInsideViewport(page: Page, testId: string, size: ViewportCase) {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`${testId} introuvable`)
  expect(box.x).toBeGreaterThanOrEqual(-0.5)
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.5)
  expect(box.y).toBeGreaterThanOrEqual(-0.5)
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 0.5)
}

for (const size of SIZES) {
  test.describe(`terrain ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.mobile,
      isMobile: size.mobile,
      deviceScaleFactor: size.mobile ? 2 : 1,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })

    test('+ Repère : bouton permanent atteignable, panneau borné, repère normal enregistré à la position GPS', async ({
      page,
      backend,
    }) => {
      void backend
      await openMap(page)
      await expectReachable(page, ['Ajouter un repère', '2D', '3D', 'Couches', 'Outils'])

      const sheet = await openSheet(page)
      await expectInsideViewport(page, 'add-point-sheet', size)
      for (const name of [
        /Repère normal/,
        /Sang \/ indice/,
        /Observation cerf/,
        /Observation orignal/,
        /Caméra sang/,
      ]) {
        await expect(sheet.getByRole('radio', { name })).toBeVisible()
      }
      await expect(page.getByTestId('add-point-gps-line')).toContainText('±', {
        timeout: 20_000,
      })
      await shot(page, size, 'plus-repere')

      // The action and the close button stay on screen whatever the height.
      await expectReachable(page, ['Créer le repère ici', 'Fermer l’ajout de repère'])
      await sheet.getByRole('button', { name: 'Créer le repère ici' }).click()
      await expect(
        page.getByRole('region', { name: 'Position du nouveau point de repère' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Continuer' }).click()
      await page.getByLabel('Nom').fill('Repère GPS')
      await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
      await expect
        .poll(async () => (await readAll<{ name: string }>(page, 'waypoints')).length)
        .toBe(1)
      const [saved] = await readAll<{ name: string; coordinate: { lat: number } }>(
        page,
        'waypoints',
      )
      expect(saved?.name).toBe('Repère GPS')
      expect(saved?.coordinate.lat).toBeCloseTo(46.8, 3)
    })

    test('sang depuis + Repère : choix explicite d’une recherche, un seul indice typé, même logique que + Sang', async ({
      page,
      backend,
    }) => {
      void backend
      await openMap(page)
      const sheet = await openSheet(page)
      await sheet.getByRole('radio', { name: /Sang \/ indice/ }).click()
      await expect(page.getByTestId('add-point-gps-line')).toContainText('±', {
        timeout: 20_000,
      })
      const save = sheet.getByRole('button', { name: 'Enregistrer l’indice ici' })
      await save.scrollIntoViewIfNeeded()
      await save.click()

      // No search is open: the user is asked, nothing starts silently.
      const gate = page.getByRole('alertdialog', {
        name: 'Aucune recherche de sang ouverte',
      })
      await expect(gate).toBeVisible()
      expect(await readAll(page, 'bloodSessions')).toHaveLength(0)
      expect(await readAll(page, 'waypoints')).toHaveLength(0)
      expect(await readAll(page, 'tracks')).toHaveLength(0)

      await gate
        .getByRole('button', { name: 'Créer une recherche et enregistrer' })
        .click()
      await expect
        .poll(async () => (await readAll<StoredClue>(page, 'waypoints')).length)
        .toBe(1)
      const [first] = await readAll<StoredClue>(page, 'waypoints')
      expect(first).toMatchObject({
        category: 'blood',
        bloodKind: 'blood',
        origin: 'gps',
      })

      // The panel keeps the five field controls visible and apart.
      await expect(page.getByTestId('blood-panel')).toBeVisible()
      await page.screenshot({
        path: `test-results/recherche-active-${size.name.split(' ')[0]}.png`,
      })
      await expectReachable(page, [
        /\+ Sang/,
        /Caméra sang/,
        /Dernier indice/,
        /Mettre la recherche en pause/,
        'Terminer la recherche',
      ])
      await shot(page, size, 'recherche-active')

      // « + Sang » of the session is the same engine: same session, one more clue.
      await page
        .getByTestId('blood-panel')
        .getByRole('button', { name: /\+ Sang/ })
        .click()
      await expect
        .poll(async () => (await readAll<StoredClue>(page, 'waypoints')).length)
        .toBe(2)
      const clues = await readAll<StoredClue>(page, 'waypoints')
      expect(new Set(clues.map((c) => c.sessionId)).size).toBe(1)
      expect(await readAll(page, 'bloodSessions')).toHaveLength(1)
    })

    test('caméra sang sans recherche (Outils, + Repère) ; permission refusée sans écran bloqué', async ({
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
      await openMap(page)

      // 1. Carte → Outils → Caméra sang
      await page.getByRole('button', { name: 'Outils' }).click()
      await page.getByRole('button', { name: 'Caméra sang' }).click()
      const camera = page.getByRole('dialog', { name: /Caméra de recherche de sang/ })
      await expect(camera).toBeVisible()
      await expect(page.getByTestId('camera-warning')).toBeVisible()
      await expect(
        page.getByRole('button', { name: /Importer une photo/ }).first(),
      ).toBeVisible()
      await shot(page, size, 'camera-refusee')
      await page.getByRole('button', { name: 'Fermer la caméra' }).click()
      await expect(camera).toHaveCount(0)

      // 2. Carte → + Repère → Caméra sang
      const sheet = await openSheet(page)
      await sheet.getByRole('radio', { name: /Caméra sang/ }).click()
      await sheet.getByRole('button', { name: 'Ouvrir la caméra sang' }).click()
      await expect(camera).toBeVisible()
      await page.getByRole('button', { name: 'Fermer la caméra' }).click()
      await expect(camera).toHaveCount(0)

      // The map is usable again and nothing was created.
      await expectReachable(page, ['Ajouter un repère', 'Outils'])
      expect(await readAll(page, 'bloodSessions')).toHaveLength(0)
      expect(await readAll(page, 'waypoints')).toHaveLength(0)
    })

    test('Après le tir : cerf / orignal, actions visibles, tir consigné à la position GPS', async ({
      page,
      backend,
    }) => {
      void backend
      await page.goto('after-shot')
      await expect(
        page.getByRole('heading', { name: 'Après le tir', level: 1 }),
      ).toBeVisible()
      await expect(page.getByRole('radio', { name: 'Cerf' })).toBeVisible()
      await expect(page.getByRole('radio', { name: 'Orignal' })).toBeVisible()
      for (const name of [
        'Consigner le tir',
        'Consigner les indices',
        'Démarrer une recherche',
        /Caméra sang/,
      ]) {
        await expect(page.getByRole('button', { name })).toBeVisible()
      }
      await expect(page.getByTestId('last-clue')).toBeVisible()
      await expect(page.getByText(/reste à compléter/).first()).toBeVisible()
      const o = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(o.scroll, 'défilement horizontal').toBeLessThanOrEqual(o.client + 1)
      await shot(page, size, 'apres-le-tir')

      await page.getByRole('radio', { name: 'Orignal' }).click()
      await page.getByRole('button', { name: 'Consigner le tir' }).click()
      const form = page.getByRole('form', { name: 'Consigner le tir' })
      await expect(form).toContainText(/GPS ±/, { timeout: 20_000 })
      await form.getByLabel(/Réaction observée/).fill('a sursauté')
      await form.getByRole('button', { name: 'Enregistrer le tir' }).click()
      await expect.poll(async () => (await readAll(page, 'observations')).length).toBe(1)
      const [entry] = await readAll<{
        shot?: { species: string; reaction?: string; estimatedAnimalPosition?: unknown }
        positionOrigin?: string
        deer?: unknown
      }>(page, 'observations')
      expect(entry?.shot).toEqual({ species: 'moose', reaction: 'a sursauté' })
      expect(entry?.positionOrigin).toBe('gps')
      expect(entry?.deer).toBeUndefined()
    })
  })
}

/**
 * Les cinq types de « + Repère » doivent être visibles ET touchables sans
 * aucun défilement, en portrait étroit (320x568) comme en paysage court
 * (568x320). Chromium simulé : ne valide pas un iPhone réel.
 */
for (const size of [
  { name: '320x568', width: 320, height: 568 },
  { name: '568x320', width: 568, height: 320 },
]) {
  test.describe(`types de repère sans défilement ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
      permissions: ['geolocation'],
      geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
    })

    test('les 5 types sont visibles et touchables sans défilement, et la sélection crée le repère', async ({
      page,
      backend,
    }) => {
      void backend
      await openMap(page)
      const sheet = await openSheet(page)
      const names = [
        /Repère normal/,
        /Sang \/ indice/,
        /Observation cerf/,
        /Observation orignal/,
        /Caméra sang/,
      ]
      const radios = []
      for (const name of names) {
        const radio = sheet.getByRole('radio', { name })
        await expect(radio).toBeVisible()
        radios.push(await radio.elementHandle())
      }
      const measured = await page.evaluate((els) => {
        return els.map((el) => {
          if (!el) return null
          const r = el.getBoundingClientRect()
          let scroller: HTMLElement | null = el.parentElement
          while (scroller && getComputedStyle(scroller).overflowY !== 'auto') {
            scroller = scroller.parentElement
          }
          const clip = scroller?.getBoundingClientRect()
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return {
            scrollTop: scroller?.scrollTop ?? 0,
            w: r.width,
            h: r.height,
            inViewport:
              r.left >= -0.5 &&
              r.top >= -0.5 &&
              r.right <= window.innerWidth + 0.5 &&
              r.bottom <= window.innerHeight + 0.5,
            inScroller: clip
              ? r.top >= clip.top - 0.5 && r.bottom <= clip.bottom + 0.5
              : true,
            hit: !!hit && (el === hit || el.contains(hit)),
          }
        })
      }, radios)
      measured.forEach((m, i) => {
        const label = String(names[i])
        expect(m, `${label} introuvable`).not.toBeNull()
        if (!m) return
        expect(m.scrollTop, `${label} : liste déjà défilée`).toBe(0)
        expect(m.inViewport, `${label} hors de l’écran`).toBe(true)
        expect(m.inScroller, `${label} coupé par le défilement`).toBe(true)
        expect(m.hit, `${label} recouvert`).toBe(true)
        expect(m.h, `${label} cible tactile < 44 px`).toBeGreaterThanOrEqual(43.5)
        expect(m.w, `${label} cible tactile < 44 px`).toBeGreaterThanOrEqual(43.5)
      })
      await shot(page, { ...size, mobile: true }, 'types-repere')

      // La sélection crée bien le repère (observations cerf et orignal ici ;
      // repère normal, sang et caméra : voir les parcours ci-dessus).
      await expect(page.getByTestId('add-point-gps-line')).toContainText('±', {
        timeout: 20_000,
      })
      for (const [name, count] of [
        [/Observation cerf/, 1],
        [/Observation orignal/, 2],
      ] as const) {
        await sheet.getByRole('radio', { name }).click()
        await expect(sheet.getByRole('radio', { name })).toHaveAttribute(
          'aria-checked',
          'true',
        )
        const action = sheet.getByRole('button', {
          name: 'Enregistrer l’observation ici',
        })
        await expect(action).toBeVisible()
        await action.click()
        await expect
          .poll(async () => (await readAll(page, 'observations')).length)
          .toBe(count)
        if (count === 1) await openSheet(page)
      }
      const saved = await readAll<{ species?: string; deer?: unknown }>(
        page,
        'observations',
      )
      expect(saved.filter((o) => o.species === 'moose')).toHaveLength(1)
      expect(saved.filter((o) => o.deer !== undefined)).toHaveLength(1)
    })
  })
}

test.describe('terrain : appui long sur la carte', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    permissions: ['geolocation'],
    geolocation: { latitude: 46.8, longitude: -71.2, accuracy: 6 },
  })

  test('un appui long ouvre le même panneau pour le point touché ; un toucher bref ne l’ouvre pas', async ({
    page,
    backend,
  }) => {
    void backend
    await openMap(page)
    const canvas = page.locator('canvas.maplibregl-canvas')
    const box = await canvas.boundingBox()
    if (!box) throw new Error('carte introuvable')
    const x = box.x + box.width * 0.4
    const y = box.y + box.height * 0.4

    await page.touchscreen.tap(x, y)
    await expect(page.getByTestId('add-point-sheet')).toHaveCount(0)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    })
    // The finger stays down until the panel is open (a loaded machine may fire
    // the timer late); then it lifts, and the panel must still be there.
    await expect(page.getByTestId('add-point-sheet')).toBeVisible({ timeout: 15_000 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(900)
    await expect(page.getByTestId('add-point-sheet')).toBeVisible()
    await expect(page.getByTestId('add-point-gps-line')).toContainText('Point pressé')
    // Same type choice as the button.
    await expect(page.getByRole('radio', { name: /Observation orignal/ })).toBeVisible()
    expect(await readAll(page, 'waypoints')).toHaveLength(0)
  })
})
