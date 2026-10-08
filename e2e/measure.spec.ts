import type { Locator, Page } from '@playwright/test'
import { measureLayout } from './support/layout'
import { countPixelsNear } from './support/pixels'
import { VIEWPORTS, type ViewportCase } from './support/viewports'
import { expect, test } from './support/test'

/**
 * Distance / area measure tools. Chromium + simulated map provider: proves the
 * app's logic, the map drawing through the adapter and the layout, not the feel
 * of tapping on a real phone. Measurements are ephemeral: nothing is stored.
 */

// Software-rendered WebGL + several canvas screenshots: give slow CI some slack.
test.describe.configure({ timeout: 120_000 })

const R = 6_371_000
const TEAL: [number, number, number] = [20, 184, 166]

interface LatLng {
  lat: number
  lng: number
}

/** INDEPENDENT reference: area of a spherical triangle from unit vectors,
 * tan(E/2) = |a·(b×c)| / (1 + a·b + b·c + c·a) (Van Oosterom & Strackee).
 * Not the formula used by the app (per-edge excess), so a shared bug cannot
 * cancel out. */
type Vec3 = [number, number, number]

function sphericalTriangleArea(a: LatLng, b: LatLng, c: LatLng): number {
  const unit = ({ lat, lng }: LatLng): Vec3 => {
    const phi = (lat * Math.PI) / 180
    const lambda = (lng * Math.PI) / 180
    return [
      Math.cos(phi) * Math.cos(lambda),
      Math.cos(phi) * Math.sin(lambda),
      Math.sin(phi),
    ]
  }
  const dot = (u: Vec3, v: Vec3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const cross = (u: Vec3, v: Vec3): Vec3 => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ]
  const ua = unit(a)
  const ub = unit(b)
  const uc = unit(c)
  const triple = Math.abs(dot(ua, cross(ub, uc)))
  const excess = 2 * Math.atan2(triple, 1 + dot(ua, ub) + dot(ub, uc) + dot(uc, ua))
  return excess * R * R
}

async function openMeasure(
  page: Page,
  name: 'Mesurer une distance' | 'Mesurer une surface',
) {
  await page.getByRole('button', { name: 'Outils' }).click()
  await page.getByRole('button', { name }).click()
}

/** Taps the canvas at fractions of its size. */
async function tapAt(canvas: Locator, fx: number, fy: number) {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas not laid out')
  await canvas.click({ position: { x: box.width * fx, y: box.height * fy } })
}

async function readPoints(page: Page): Promise<LatLng[]> {
  return page.locator('[data-testid="measure-body"] li[data-lat]').evaluateAll((items) =>
    items.map((item) => ({
      lat: Number(item.getAttribute('data-lat')),
      lng: Number(item.getAttribute('data-lng')),
    })),
  )
}

/** Digits of "12 345 678 m²" -> 12345678 (any space / NBSP / thin space). */
function squareMetersFrom(text: string): number {
  return Number(text.replace(/[^\d]/g, ''))
}

test.describe('outils de mesure', () => {
  test.beforeEach(async ({ page, backend }) => {
    void backend
    await page.goto('map')
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  })

  test('surface : 3 points, aire cohérente avec un calcul indépendant, annuler, terminer, effacer', async ({
    page,
  }) => {
    const canvas = page.locator('canvas.maplibregl-canvas')
    await openMeasure(page, 'Mesurer une surface')
    const panel = page.getByRole('region', { name: 'Mesure de surface' })
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('measure-status')).toContainText('Mode actif')
    await expect(panel.getByText(/Cette mesure est éphémère/)).toBeVisible()

    await tapAt(canvas, 0.25, 0.15)
    await tapAt(canvas, 0.45, 0.15)
    await tapAt(canvas, 0.45, 0.3)
    await expect(page.getByTestId('measure-status')).toContainText('3 points')

    // The three vertices are drawn on the canvas (teal dots) by the adapter.
    await expect
      .poll(() => countPixelsNear(page, canvas, TEAL, 30), { timeout: 30_000 })
      .toBeGreaterThan(30)

    const points = await readPoints(page)
    expect(points).toHaveLength(3)
    const [a, b, c] = points as [LatLng, LatLng, LatLng]
    const expectedM2 = sphericalTriangleArea(a, b, c)
    expect(expectedM2).toBeGreaterThan(1e6)

    const m2Text = await panel.getByText(/m²$/).first().innerText()
    const shownM2 = squareMetersFrom(m2Text)
    expect(Math.abs(shownM2 - expectedM2) / expectedM2).toBeLessThan(1e-4)
    // Hectares and acres shown agree with the m² (same single source).
    const haText = await panel.getByText(/\sha$/).first().innerText()
    const shownHa = Number(haText.replace(/\s/g, '').replace(',', '.').replace('ha', ''))
    expect(Math.abs(shownHa - expectedM2 / 10_000) / (expectedM2 / 10_000)).toBeLessThan(
      1e-3,
    )
    await expect(panel.getByText(/acres?$/).first()).toBeVisible()
    await expect(panel.getByRole('alert')).toHaveCount(0)

    // Undo the last point: back to 2 points, no area.
    await panel.getByRole('button', { name: 'Annuler le dernier point' }).click()
    await expect(page.getByTestId('measure-status')).toContainText('2 points')
    await expect(panel.getByText(/au moins 3 points/)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Terminer' })).toBeDisabled()

    // Re-add it, finish: locked, further taps are ignored.
    await tapAt(canvas, 0.45, 0.3)
    await panel.getByRole('button', { name: 'Terminer' }).click()
    await expect(page.getByTestId('measure-status')).toContainText('Terminée')
    await tapAt(canvas, 0.3, 0.25)
    await expect(page.getByTestId('measure-status')).toContainText('3 points')

    // Clear: no points, tool armed again.
    await panel.getByRole('button', { name: 'Effacer' }).click()
    await expect(page.getByTestId('measure-status')).toContainText('0 point')
    await expect(page.getByTestId('measure-status')).toContainText('Mode actif')
    await expect
      .poll(() => countPixelsNear(page, canvas, TEAL, 30), { timeout: 30_000 })
      .toBe(0)

    // Ephemeral: nothing was written to the database.
    const stored = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open('field-terrain-intelligence')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const names = Array.from(open.result.objectStoreNames)
            resolve(names.filter((n) => /measure|mesure/i.test(n)).length)
          }
        }),
    )
    expect(stored).toBe(0)
  })

  test('distance : trois libellés distincts, 3D seulement quand l’élévation est réellement chargée', async ({
    page,
  }) => {
    const canvas = page.locator('canvas.maplibregl-canvas')
    await openMeasure(page, 'Mesurer une distance')
    const panel = page.getByRole('region', { name: 'Mesure de distance' })

    await tapAt(canvas, 0.25, 0.25)
    await tapAt(canvas, 0.45, 0.25)
    await tapAt(canvas, 0.25, 0.25)

    await expect(panel.getByText(/Longueur du tracé/)).toBeVisible()
    await expect(panel.getByText(/Distance à vol d’oiseau/)).toBeVisible()
    await expect(panel.getByText(/Distance 3D/)).toBeVisible()
    const dd = (label: RegExp) =>
      panel.getByText(label).locator('xpath=following-sibling::dd')
    const bird = dd(/Distance à vol d’oiseau/)
    // Out and back: bird-flight is 0, the path is not.
    await expect(bird).toHaveText(/^0,0\s?m$/)
    await expect(dd(/Longueur du tracé/)).not.toHaveText(/^0,0\s?m/)

    // The simulated DEM is a flat 0 m: the 3D figure is either "indisponible"
    // (tiles not loaded yet) or, once loaded, equal to the 2D path. It must
    // never show something in between, and it must resolve by itself.
    const path3d = dd(/Distance 3D/)
    await expect(path3d).toHaveText(/^(indisponible : élévation non chargée|\d)/)
    await expect
      .poll(
        async () =>
          (await path3d.innerText()) === (await dd(/Longueur du tracé/).innerText()),
        {
          timeout: 30_000,
        },
      )
      .toBe(true)
  })

  test('mesurer ne bloque pas le placement d’un point de repère (un seul mode à la fois)', async ({
    page,
  }) => {
    const canvas = page.locator('canvas.maplibregl-canvas')
    await openMeasure(page, 'Mesurer une distance')
    await tapAt(canvas, 0.25, 0.25)

    await page.getByRole('button', { name: 'Ajouter un point de repère' }).click()
    await expect(page.getByTestId('measure-status')).toContainText('En pause')
    await tapAt(canvas, 0.35, 0.35)
    await expect(
      page.getByRole('region', { name: 'Position du nouveau point de repère' }),
    ).toBeVisible()
    // The tap became the waypoint draft, not a measure point.
    await expect(page.getByTestId('measure-status')).toContainText('1 point')
  })
})

const MEASURE_VIEWPORTS: readonly ViewportCase[] = [
  ...VIEWPORTS,
  { name: '568x320 (paysage)', width: 568, height: 320, mobile: true },
]

for (const viewport of MEASURE_VIEWPORTS) {
  test.describe(`mesure ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.mobile,
      isMobile: viewport.mobile,
      deviceScaleFactor: viewport.mobile ? 2 : 1,
    })

    test('panneau compact, repliable, contrôles accessibles et non masqués', async ({
      page,
      backend,
    }) => {
      void backend
      await page.goto('map')
      const canvas = page.locator('canvas.maplibregl-canvas')
      await expect(canvas).toBeVisible()

      await openMeasure(page, 'Mesurer une surface')
      const panel = page.getByRole('region', { name: 'Mesure de surface' })
      await expect(panel).toBeVisible()
      await tapAt(canvas, 0.15, 0.12)
      await tapAt(canvas, 0.4, 0.12)
      await tapAt(canvas, 0.4, 0.2)
      await expect(page.getByTestId('measure-status')).toContainText('3 points')

      for (const wantExpanded of [true, false]) {
        const toggle = panel.getByRole('button', { name: /les résultats$/ })
        // Short landscape folds on its own: only click when the state differs.
        const expanded = (await toggle.getAttribute('aria-expanded')) === 'true'
        if (expanded !== wantExpanded) await toggle.click()

        const m = await measureLayout(page)
        expect(m.document.scrollWidth, 'défilement horizontal').toBeLessThanOrEqual(
          m.document.clientWidth,
        )
        expect(m.document.scrollHeight, 'défilement vertical').toBeLessThanOrEqual(
          m.document.clientHeight,
        )
        const problems = m.controls
          // The MapLibre attribution pill is legal text, and on a 568x320 phone
          // the existing tool rail already covers it WITHOUT any measure open
          // (verified): not caused by, nor in scope of, this tool.
          .filter((control) => !/^maplibre$/i.test(control.label))
          .filter((control) => !control.inViewport || !control.hit)
          .map((control) => `${control.label} ${JSON.stringify(control.rect)}`)
        expect(problems, 'contrôles hors écran ou masqués').toEqual([])
        if (viewport.mobile) {
          const small = m.controls
            .filter(
              (control) =>
                control.minSide < 44 &&
                !/maplibre|openstreetmap|maptiler|esri|©/i.test(control.label),
            )
            .map(
              (control) =>
                `${control.label} ${Math.round(control.rect.width)}x${Math.round(control.rect.height)}`,
            )
          expect(small, 'cibles tactiles < 44 px').toEqual([])
        }

        // The panel stays inside the map and leaves it most of its height.
        const panelBox = await panel.boundingBox()
        const mapBox = await canvas.boundingBox()
        expect(panelBox && mapBox).toBeTruthy()
        if (panelBox && mapBox) {
          expect(panelBox.y).toBeGreaterThanOrEqual(mapBox.y - 1)
          expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(
            mapBox.y + mapBox.height + 1,
          )
          expect(panelBox.height).toBeLessThanOrEqual(mapBox.height * 0.76)
        }
      }
    })
  })
}
