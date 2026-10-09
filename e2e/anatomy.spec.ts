import type { Page } from '@playwright/test'
import { expect, test } from './support/test'

/**
 * Module « Anatomie et point d'impact ». Chromium uniquement, appareil tactile
 * ÉMULÉ : ceci ne valide PAS un iPhone réel, et WebKit n'est pas installé dans
 * cet environnement (voir docs/ANATOMIE_APRES_LE_TIR.md).
 */
const SIZES = [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '568x320', width: 568, height: 320 },
  { name: '844x390', width: 844, height: 390 },
] as const

const SHOT_ID = 'e2e-shot'

async function shotPicture(page: Page, size: string, name: string) {
  if (process.env.E2E_SCREENSHOTS === '1') {
    await page.screenshot({ path: `docs/validation/anatomie-${name}-${size}.png` })
  }
}

async function seedShot(page: Page, species: 'deer' | 'moose' = 'deer') {
  await page.goto('after-shot')
  await expect(
    page.getByRole('heading', { name: 'Après le tir', level: 1 }),
  ).toBeVisible()
  await page.evaluate(
    ({ id, species: sp }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('observations', 'readwrite')
          tx.objectStore('observations').put({
            id,
            coordinate: { lat: 46.8, lng: -71.2 },
            timestamp: '2026-10-05T10:00:00.000Z',
            createdAt: '2026-10-05T10:00:00.000Z',
            notes: '',
            positionOrigin: 'manual',
            shot: { species: sp, reaction: 'a bondi' },
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    { id: SHOT_ID, species },
  )
}

async function readShot(page: Page) {
  return page.evaluate(
    (id) =>
      new Promise<{ shot?: Record<string, unknown> }>((resolve, reject) => {
        const open = indexedDB.open('field-terrain-intelligence')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result
            .transaction('observations')
            .objectStore('observations')
            .get(id)
          req.onsuccess = () => resolve(req.result as { shot?: Record<string, unknown> })
          req.onerror = () => reject(req.error)
        }
      }),
    SHOT_ID,
  )
}

async function openModule(page: Page) {
  await seedShot(page)
  await page.goto(`after-shot/anatomie?shot=${SHOT_ID}`)
  await expect(page.getByTestId('anatomy-canvas')).toBeVisible()
}

/** Screen position of a point given as 0..1 of the whole drawing, using the
 * box the canvas says it currently shows. */
async function screenOf(page: Page, nx: number, ny: number, w: number, h: number) {
  const canvas = page.getByTestId('anatomy-canvas')
  const rect = await canvas.boundingBox()
  const attr = await canvas.getAttribute('data-box')
  if (!rect || !attr) throw new Error('canvas absent')
  const [bx = 0, by = 0, bw = 1, bh = 1] = attr.split(',').map(Number)
  const ppu = Math.min(rect.width / bw, rect.height / bh)
  const offX = (rect.width - bw * ppu) / 2
  const offY = (rect.height - bh * ppu) / 2
  return {
    x: rect.x + offX + (nx * w - bx) * ppu,
    y: rect.y + offY + (ny * h - by) * ppu,
  }
}

async function handleAt(page: Page) {
  const handle = page.getByTestId('impact-handle')
  return {
    x: Number(await handle.getAttribute('data-x')),
    y: Number(await handle.getAttribute('data-y')),
  }
}

// Deer drawing: 400x260. Chest anchor (208,128), rear-ribs anchor (256,134).
const DEER = { w: 400, h: 260 }

for (const size of SIZES) {
  test.describe(`anatomie ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })

    test('écran : espèces, dessin assez grand, aucun défilement horizontal', async ({
      page,
      backend,
    }) => {
      void backend
      await openModule(page)
      await expect(page.getByRole('radio', { name: 'Cerf' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await expect(page.getByRole('radio', { name: 'Orignal' })).toBeVisible()
      await expect(page.getByTestId('view-caption')).toContainText('Profil gauche')
      const viewer = await page.getByTestId('anatomy-viewer').boundingBox()
      expect(viewer?.width ?? 0).toBeGreaterThanOrEqual(Math.min(size.width - 40, 280))
      expect(viewer?.height ?? 0).toBeGreaterThanOrEqual(150)
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }))
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1)
      await shotPicture(page, size.name, 'ecran')
    })

    test('toucher place le point, il se déplace, la région suit', async ({
      page,
      backend,
    }) => {
      void backend
      await openModule(page)
      const target = await screenOf(page, 208 / DEER.w, 128 / DEER.h, DEER.w, DEER.h)
      await page.touchscreen.tap(target.x, target.y)
      const placed = await handleAt(page)
      expect(placed.x).toBeCloseTo(208 / DEER.w, 1)
      expect(placed.y).toBeCloseTo(128 / DEER.h, 1)
      await expect(page.getByTestId('panel-region')).toContainText('zone cœur-poumons')
      await expect(page.getByTestId('impact-panel')).toHaveAttribute('data-open', 'true')
      await shotPicture(page, size.name, 'point-place')

      // Drag the handle onto the rear ribs (mouse-driven drag of the handle).
      const from = await screenOf(page, placed.x, placed.y, DEER.w, DEER.h)
      const to = await screenOf(page, 256 / DEER.w, 134 / DEER.h, DEER.w, DEER.h)
      await page.mouse.move(from.x, from.y)
      await page.mouse.down()
      await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 })
      await page.mouse.move(to.x, to.y, { steps: 4 })
      await page.mouse.up()
      const moved = await handleAt(page)
      expect(moved.x).toBeCloseTo(256 / DEER.w, 1)
      await expect(page.getByTestId('panel-region')).toContainText('Arrière des côtes')
    })

    test('coordonnées justes après zoom et après redimensionnement', async ({
      page,
      backend,
    }) => {
      void backend
      await openModule(page)
      const canvas = page.getByTestId('anatomy-canvas')
      await page.getByRole('button', { name: 'Zoom avant' }).click()
      await page.getByRole('button', { name: 'Zoom avant' }).click()
      await expect(canvas).not.toHaveAttribute('data-scale', '1.000')
      // Pan so the chest is in view: drag the drawing (zoomed) toward it.
      const rect = await canvas.boundingBox()
      if (!rect) throw new Error('canvas absent')
      const chest = { nx: 208 / DEER.w, ny: 128 / DEER.h }
      for (let i = 0; i < 6; i++) {
        const where = await screenOf(page, chest.nx, chest.ny, DEER.w, DEER.h)
        const inside =
          where.x > rect.x + 10 &&
          where.x < rect.x + rect.width - 10 &&
          where.y > rect.y + 10 &&
          where.y < rect.y + rect.height - 10
        if (inside) break
        const cx = rect.x + rect.width / 2
        const cy = rect.y + rect.height / 2
        await page.mouse.move(cx, cy)
        await page.mouse.down()
        await page.mouse.move(cx + (cx - where.x) / 2, cy + (cy - where.y) / 2, {
          steps: 5,
        })
        await page.mouse.up()
      }
      const target = await screenOf(page, chest.nx, chest.ny, DEER.w, DEER.h)
      await page.touchscreen.tap(target.x, target.y)
      const zoomed = await handleAt(page)
      expect(zoomed.x).toBeCloseTo(chest.nx, 1)
      expect(zoomed.y).toBeCloseTo(chest.ny, 1)

      // Rotate: same point, same panel state.
      await page.setViewportSize({ width: size.height, height: size.width })
      await expect(page.getByTestId('impact-handle')).toBeVisible()
      const rotated = await handleAt(page)
      expect(rotated).toEqual(zoomed)
      await expect(page.getByTestId('impact-panel')).toHaveAttribute('data-open', 'true')
      await expect(page.getByRole('radio', { name: 'Cerf' })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      await shotPicture(page, size.name, 'zoom-rotation')
    })

    test('liste de régions, panneau repliable, réinitialisation', async ({
      page,
      backend,
    }) => {
      void backend
      await openModule(page)
      await page
        .getByLabel('Choisir une région')
        .selectOption({ label: 'Arrière des côtes' })
      await expect(page.getByTestId('impact-handle')).toBeVisible()
      await expect(page.getByTestId('panel-region')).toContainText('Arrière des côtes')
      expect((await handleAt(page)).x).toBeCloseTo(256 / DEER.w, 2)

      const panel = page.getByTestId('impact-panel')
      const toggle = panel.getByRole('button', { name: /Région :/ })
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(panel).toHaveAttribute('data-open', 'false')
      // The save button stays visible, and a tap on the drawing does not
      // reopen or close the panel by itself.
      await expect(page.getByTestId('save-impact')).toBeVisible()
      const target = await screenOf(page, 0.3, 0.45, DEER.w, DEER.h)
      await page.touchscreen.tap(target.x, target.y)
      await expect(panel).toHaveAttribute('data-open', 'false')
      await shotPicture(page, size.name, 'panneau-replie')

      await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click()
      await expect(page.getByTestId('impact-handle')).toHaveCount(0)
      await expect(page.getByTestId('anatomy-canvas')).toHaveAttribute(
        'data-scale',
        '1.000',
      )
    })
  })
}

test.describe('anatomie : contenu, enregistrement, hors ligne', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })

  test('cerf et orignal ont deux dessins distincts et le point ne se transpose pas', async ({
    page,
    backend,
  }) => {
    void backend
    await openModule(page)
    const deerShape = await page
      .locator('[data-testid="anatomy-canvas"] path')
      .nth(4)
      .getAttribute('d')
    await page.getByLabel('Choisir une région').selectOption({ label: 'Épaule' })
    await expect(page.getByTestId('impact-handle')).toBeVisible()
    await page.getByRole('radio', { name: 'Orignal' }).click()
    await expect(page.getByTestId('anatomy-canvas')).toHaveAttribute(
      'data-species',
      'moose',
    )
    await expect(page.getByTestId('impact-handle')).toHaveCount(0)
    await expect(page.getByTestId('anatomy-message')).toContainText('distincts')
    const mooseShape = await page
      .locator('[data-testid="anatomy-canvas"] path')
      .nth(4)
      .getAttribute('d')
    expect(mooseShape).not.toBe(deerShape)
    await page.getByLabel('Choisir une région').selectOption({ label: 'Épaule' })
    await expect(page.getByTestId('impact-handle')).toBeVisible()
    await shotPicture(page, '390x844', 'orignal')
    await page.getByRole('radio', { name: 'Cerf' }).click()
    await page
      .getByLabel('Choisir une région')
      .selectOption({ label: 'Arrière des côtes' })
  })

  test('enregistrer, retrouver après rechargement, modifier, retirer', async ({
    page,
    backend,
  }) => {
    void backend
    await openModule(page)
    await page
      .getByLabel('Choisir une région')
      .selectOption({ label: 'Côtes avant (zone cœur-poumons)' })
    await page.getByLabel('Note sur ce point').fill('ma note')
    await page.getByTestId('save-impact').click()
    await expect(page.getByTestId('saved-impact')).toBeVisible()
    await expect
      .poll(async () => (await readShot(page)).shot?.impact)
      .toMatchObject({
        species: 'deer',
        view: 'lateral-left',
        regionId: 'thorax',
        presumed: true,
        illustrationVersion: 'cerf-profil-gauche-1',
        note: 'ma note',
      })
    const saved = (await readShot(page)).shot?.impact as {
      x: number
      y: number
      recordedAt: string
    }
    expect(saved.x).toBeGreaterThan(0)
    expect(typeof saved.recordedAt).toBe('string')
    // The rest of the shot record is untouched.
    expect((await readShot(page)).shot).toMatchObject({
      species: 'deer',
      reaction: 'a bondi',
    })

    // From « Après le tir », the estimate is shown and can be reopened.
    await page.goto('after-shot')
    await page
      .getByRole('button', { name: /Cerf/ })
      .filter({ hasText: '·' })
      .first()
      .click()
    await expect(page.getByTestId('shot-impact-summary')).toContainText(
      'zone cœur-poumons',
    )
    await page.getByRole('link', { name: /Voir ou modifier le point/ }).click()
    await expect(page.getByTestId('impact-handle')).toBeVisible()
    expect(await handleAt(page)).toEqual({ x: saved.x, y: saved.y })

    // Edit then remove.
    await page.getByLabel('Choisir une région').selectOption({ label: 'Flanc et ventre' })
    await page.getByTestId('save-impact').click()
    await expect
      .poll(async () => (await readShot(page)).shot?.impact)
      .toMatchObject({ regionId: 'flank' })
    await page.getByRole('button', { name: 'Retirer l’estimation du tir' }).click()
    await expect
      .poll(async () => (await readShot(page)).shot)
      .toEqual({ species: 'deer', reaction: 'a bondi' })
  })

  test('aucun diagnostic, aucun délai, fiches sourcées', async ({ page, backend }) => {
    void backend
    await openModule(page)
    await page
      .getByLabel('Choisir une région')
      .selectOption({ label: 'Arrière des côtes' })
    const panel = page.getByTestId('impact-panel')
    await expect(
      panel.getByRole('heading', { name: 'Structures représentées à proximité' }),
    ).toBeVisible()
    const sheets = page.getByTestId('anatomy-sheet')
    expect(await sheets.count()).toBeGreaterThan(0)
    for (let i = 0; i < (await sheets.count()); i++) {
      const sheet = sheets.nth(i)
      await sheet.locator('summary').click()
      expect(await sheet.getByTestId('sheet-source').count()).toBeGreaterThan(0)
      await expect(sheet).toContainText('Version du contenu : contenu-0.1.0')
      await expect(
        sheet.getByTestId('sheet-source').first().locator('a'),
      ).toHaveAttribute('href', /^https:\/\//)
    }
    await page.getByTestId('anatomy-provenance').locator('summary').click()

    // Only the module's own texts: the shot label above shows a clock time.
    const text =
      (await panel.innerText()) +
      (await page.getByTestId('anatomy-provenance').innerText())
    expect(text).not.toMatch(/organes? touchés?/i)
    expect(text).not.toMatch(
      /probabilit|chances? de survie|mortel à|distance de fuite estimée/i,
    )
    expect(text).not.toMatch(/\d+\s*(min|minutes|h|heures)\b/i)
    await expect(page.getByTestId('anatomy-page').locator('[role="timer"]')).toHaveCount(
      0,
    )
  })

  test('sans réseau : le module s’ouvre et fonctionne', async ({
    page,
    context,
    backend,
  }) => {
    void backend
    await openModule(page)
    await page.evaluate(() => navigator.serviceWorker.ready)
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
        timeout: 20_000,
      })
      .toBe(true)
    backend.setOnline(false)
    await context.setOffline(true)
    await page.goto(`after-shot/anatomie?shot=${SHOT_ID}`)
    await expect(page.getByTestId('anatomy-canvas')).toBeVisible()
    await page.getByLabel('Choisir une région').selectOption({ label: 'Épaule' })
    await expect(page.getByTestId('impact-handle')).toBeVisible()
    await expect(page.getByTestId('anatomy-sheet').first()).toBeAttached()
    await page.getByTestId('anatomy-provenance').locator('summary').click()
    await expect(page.getByTestId('anatomy-provenance')).toContainText('Licence')
  })
})
