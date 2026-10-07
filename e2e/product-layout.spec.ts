import type { Page } from '@playwright/test'
import { VIEWPORTS, type ViewportCase } from './support/viewports'
import { expect, test } from './support/test'

/**
 * No horizontal overflow on the product pages (accueil, présentation, aide,
 * confidentialité, à propos) at the 8 required sizes. Chromium only, with the
 * map backend simulated: real devices are NOT covered.
 */
const SIZES: readonly ViewportCase[] = [
  ...VIEWPORTS.filter((v) => !v.name.startsWith('844x390')),
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
  { name: '844x390 (paysage)', width: 844, height: 390, mobile: true },
]

async function overflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    return {
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      bodyScroll: document.body.scrollWidth,
      mainScroll: main?.scrollWidth ?? 0,
      mainClient: main?.clientWidth ?? 0,
    }
  })
}

for (const size of SIZES) {
  test.describe(`produit ${size.name}`, () => {
    test.use({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.mobile,
      isMobile: size.mobile,
      deviceScaleFactor: size.mobile ? 2 : 1,
    })

    test('présentation : la boîte tient dans l’écran, sans débordement', async ({
      page,
      backend,
    }) => {
      void backend
      await page.goto('')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const box = await dialog.boundingBox()
      if (!box) throw new Error('boîte de présentation introuvable')
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(size.width + 0.5)
      expect(box.y + box.height).toBeLessThanOrEqual(size.height + 0.5)
      // The skip button stays reachable even on a very short screen.
      await expect(dialog.getByRole('button', { name: 'Passer' })).toBeInViewport()
      const o = await overflow(page)
      expect(o.docScroll).toBeLessThanOrEqual(o.docClient)
    })

    for (const [label, path] of [
      ['accueil', ''],
      ['aide', 'help'],
      ['confidentialité', 'privacy'],
      ['à propos', 'about'],
    ] as const) {
      test(`${label} : aucun défilement horizontal`, async ({ page, backend }) => {
        void backend
        await page.goto(path)
        if (path === '') {
          await page.getByRole('dialog').getByRole('button', { name: 'Passer' }).click()
          await expect(page.getByRole('dialog')).toHaveCount(0)
        }
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const o = await overflow(page)
        expect(o.docScroll, 'document').toBeLessThanOrEqual(o.docClient)
        expect(o.bodyScroll, 'body').toBeLessThanOrEqual(o.docClient)
        expect(o.mainScroll, 'main').toBeLessThanOrEqual(o.mainClient)
      })
    }
  })
}
